import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";

import type { Expression, GetCostAndUsageResponse } from "@aws-sdk/client-cost-explorer";

export interface ServiceCost {
  serviceName: string;
  amount: number;
  unit: string;
  dayOverDayChange: number | null;
  weekOverWeekChange: number | null;
}

export interface DailyTotal {
  date: string;
  amount: number;
}

export interface AllCostData {
  date: string;
  totalAmount: number;
  services: ServiceCost[];
  currency: string;
  weeklyHistory: DailyTotal[];
  monthToDateAmount: number;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calculateChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

function parseDayCostsByService(response: GetCostAndUsageResponse, dayIndex: number): Map<string, number> {
  const costs = new Map<string, number>();
  const groups = response.ResultsByTime?.[dayIndex]?.Groups ?? [];
  for (const group of groups) {
    const serviceName = group.Keys?.[0] ?? "Unknown";
    const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0");
    costs.set(serviceName, amount);
  }
  return costs;
}

const client = new CostExplorerClient({});

export async function getAllCostData(topN = 5): Promise<AllCostData> {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);

  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);

  // Ensure yesterday is always included in the query range
  const queryStart = monthStart <= yesterday ? monthStart : yesterday;
  const queryStartStr = formatDate(queryStart);

  const excludeCreditRefundFilter: Expression = {
    Not: {
      Dimensions: {
        Key: "RECORD_TYPE",
        Values: ["Credit", "Refund"],
      },
    },
  };

  const baseParams = {
    Granularity: "DAILY" as const,
    Metrics: ["UnblendedCost"],
    GroupBy: [{ Type: "DIMENSION" as const, Key: "SERVICE" }],
    Filter: excludeCreditRefundFilter,
  };

  // Single MTD query (month-start to today, or yesterday to today if today is the 1st)
  const mtdResponse = await client.send(new GetCostAndUsageCommand({
    ...baseParams,
    TimePeriod: { Start: queryStartStr, End: todayStr },
  }));

  const resultsByTime = mtdResponse.ResultsByTime ?? [];

  // Find yesterday's index in the results
  const yesterdayIndex = resultsByTime.findIndex(
    (r) => r.TimePeriod?.Start === yesterdayStr,
  );

  // Parse yesterday's costs
  const yesterdayCosts: Map<string, number> = yesterdayIndex >= 0
    ? parseDayCostsByService(mtdResponse, yesterdayIndex)
    : new Map<string, number>();

  // Parse day-before-yesterday's costs
  const dayBeforeYesterdayIndex = yesterdayIndex > 0 ? yesterdayIndex - 1 : -1;
  const dayBeforeCosts: Map<string, number> = dayBeforeYesterdayIndex >= 0
    ? parseDayCostsByService(mtdResponse, dayBeforeYesterdayIndex)
    : new Map<string, number>();

  // Determine week-over-week comparison data
  const yesterdayDayOfMonth = yesterday.getUTCDate();
  let lastWeekCosts: Map<string, number> | null = null;

  if (yesterdayDayOfMonth >= 8) {
    // Same weekday last week is within MTD data (8 days before yesterday = yesterday index - 7)
    const lastWeekIndex = yesterdayIndex - 7;
    if (lastWeekIndex >= 0) {
      lastWeekCosts = parseDayCostsByService(mtdResponse, lastWeekIndex);
    }
  }
  else {
    // Early month: check ENABLE_WEEK_OVER_WEEK env var
    const enableWoW = process.env.ENABLE_WEEK_OVER_WEEK === "true";
    if (enableWoW) {
      // Make one additional API call for the same day last week
      const sameDayLastWeek = new Date(today);
      sameDayLastWeek.setUTCDate(today.getUTCDate() - 8);
      const dayAfterSameDayLastWeek = new Date(today);
      dayAfterSameDayLastWeek.setUTCDate(today.getUTCDate() - 7);

      const lastWeekResponse = await client.send(new GetCostAndUsageCommand({
        ...baseParams,
        TimePeriod: {
          Start: formatDate(sameDayLastWeek),
          End: formatDate(dayAfterSameDayLastWeek),
        },
      }));

      lastWeekCosts = new Map();
      const groups = lastWeekResponse.ResultsByTime?.[0]?.Groups ?? [];
      for (const group of groups) {
        const serviceName = group.Keys?.[0] ?? "Unknown";
        const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0");
        lastWeekCosts.set(serviceName, amount);
      }
    }
  }

  // Determine currency
  const currency = yesterdayCosts.size > 0
    ? (resultsByTime[yesterdayIndex]?.Groups?.[0]?.Metrics?.UnblendedCost?.Unit ?? "USD")
    : "USD";

  // Build service costs with changes
  const services: ServiceCost[] = [];
  for (const [serviceName, amount] of yesterdayCosts.entries()) {
    const previousDayAmount = dayBeforeCosts.get(serviceName) ?? 0;
    const lastWeekAmount = lastWeekCosts?.get(serviceName) ?? 0;
    services.push({
      serviceName,
      amount,
      unit: currency,
      dayOverDayChange: calculateChange(amount, previousDayAmount),
      weekOverWeekChange: lastWeekCosts !== null
        ? calculateChange(amount, lastWeekAmount)
        : null,
    });
  }

  services.sort((a, b) => b.amount - a.amount);

  // Top N + Others aggregation
  const topServices = services.slice(0, topN);
  const otherServices = services.slice(topN);

  if (otherServices.length > 0) {
    const othersAmount = otherServices.reduce((sum, s) => sum + s.amount, 0);
    const previousOthersAmount = otherServices.reduce(
      (sum, s) => sum + (dayBeforeCosts.get(s.serviceName) ?? 0), 0,
    );
    const lastWeekOthersAmount = lastWeekCosts !== null
      ? otherServices.reduce((sum, s) => sum + (lastWeekCosts.get(s.serviceName) ?? 0), 0)
      : 0;
    topServices.push({
      serviceName: "Others",
      amount: othersAmount,
      unit: currency,
      dayOverDayChange: calculateChange(othersAmount, previousOthersAmount),
      weekOverWeekChange: lastWeekCosts !== null
        ? calculateChange(othersAmount, lastWeekOthersAmount)
        : null,
    });
  }

  const totalAmount = services.reduce((sum, s) => sum + s.amount, 0);

  // Weekly history: last 7 days of daily totals from the MTD response
  const weeklyHistory: DailyTotal[] = [];
  const last7Start = Math.max(0, resultsByTime.length - 7);
  for (let i = last7Start; i < resultsByTime.length; i++) {
    const day = resultsByTime[i];
    const date = day.TimePeriod?.Start ?? "";
    const groups = day.Groups ?? [];
    const dayTotal = groups.reduce(
      (sum, g) => sum + parseFloat(g.Metrics?.UnblendedCost?.Amount ?? "0"), 0,
    );
    weeklyHistory.push({ date, amount: dayTotal });
  }

  // Month-to-date total: sum all days in the results
  const monthToDateAmount = resultsByTime.reduce((sum, day) => {
    const groups = day.Groups ?? [];
    return sum + groups.reduce(
      (daySum, g) => daySum + parseFloat(g.Metrics?.UnblendedCost?.Amount ?? "0"), 0,
    );
  }, 0);

  return {
    date: yesterdayStr,
    totalAmount,
    services: topServices,
    currency,
    weeklyHistory,
    monthToDateAmount,
  };
}
