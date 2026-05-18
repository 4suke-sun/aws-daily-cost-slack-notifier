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

export interface DailyServiceBreakdown {
  date: string;
  services: Map<string, number>;
  total: number;
}

export interface AllCostData {
  date: string;
  totalAmount: number;
  services: ServiceCost[];
  currency: string;
  weeklyHistory: DailyTotal[];
  weeklyServiceHistory: DailyServiceBreakdown[];
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
    const amount = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0");
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
  const monthStartStr = formatDate(monthStart);

  // クエリ開始日: 月初と7日前の早い方を使い、常に7日分のデータを確保
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setUTCDate(today.getUTCDate() - 7);
  const queryStart = monthStart <= sevenDaysAgo ? monthStart : sevenDaysAgo;
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

  // 1回のAPIコールで月初(or 7日前)〜今日までのデータを取得
  const mtdResponse = await client.send(new GetCostAndUsageCommand({
    ...baseParams,
    TimePeriod: { Start: queryStartStr, End: todayStr },
  }));

  const resultsByTime = mtdResponse.ResultsByTime ?? [];

  // 昨日のインデックスを特定
  const yesterdayIndex = resultsByTime.findIndex(
    (r) => r.TimePeriod?.Start === yesterdayStr,
  );

  // 昨日のサービス別コスト
  const yesterdayCosts: Map<string, number> = yesterdayIndex >= 0
    ? parseDayCostsByService(mtdResponse, yesterdayIndex)
    : new Map<string, number>();

  // 一昨日のサービス別コスト（前日比計算用）
  const dayBeforeYesterdayIndex = yesterdayIndex > 0 ? yesterdayIndex - 1 : -1;
  const dayBeforeCosts: Map<string, number> = dayBeforeYesterdayIndex >= 0
    ? parseDayCostsByService(mtdResponse, dayBeforeYesterdayIndex)
    : new Map<string, number>();

  // 前週比データの取得
  const yesterdayDayOfMonth = yesterday.getUTCDate();
  let lastWeekCosts: Map<string, number> | null = null;

  if (yesterdayDayOfMonth >= 8) {
    // 月の8日以降: MTDデータ内に先週同曜日のデータがある
    const lastWeekIndex = yesterdayIndex - 7;
    if (lastWeekIndex >= 0) {
      lastWeekCosts = parseDayCostsByService(mtdResponse, lastWeekIndex);
    }
  }
  else {
    // 月初(1〜7日): ENABLE_WEEK_OVER_WEEK=true の場合のみ追加APIコール
    const enableWoW = process.env.ENABLE_WEEK_OVER_WEEK === "true";
    if (enableWoW) {
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
        const amount = Number.parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0");
        lastWeekCosts.set(serviceName, amount);
      }
    }
  }

  // 通貨の特定
  const currency = yesterdayCosts.size > 0
    ? (resultsByTime[yesterdayIndex]?.Groups?.[0]?.Metrics?.UnblendedCost?.Unit ?? "USD")
    : "USD";

  // サービス別コスト（前日比・前週比付き）の構築
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

  // Top N + Others 集約
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

  // 直近7日間の履歴（日付ベースでフィルタリング）
  const sevenDaysAgoStr = formatDate(sevenDaysAgo);
  const weeklyHistory: DailyTotal[] = [];
  const weeklyServiceHistory: DailyServiceBreakdown[] = [];

  for (const day of resultsByTime) {
    const date = day.TimePeriod?.Start ?? "";
    if (date < sevenDaysAgoStr || date > yesterdayStr) {
      continue;
    }
    const groups = day.Groups ?? [];
    const serviceCosts = new Map<string, number>();
    let dayTotal = 0;
    for (const g of groups) {
      const serviceName = g.Keys?.[0] ?? "Unknown";
      const amount = Number.parseFloat(g.Metrics?.UnblendedCost?.Amount ?? "0");
      serviceCosts.set(serviceName, amount);
      dayTotal += amount;
    }
    weeklyHistory.push({ date, amount: dayTotal });
    weeklyServiceHistory.push({ date, services: serviceCosts, total: dayTotal });
  }

  // 月累計: 当月分のみ合算（クエリが前月に跨る場合を考慮）
  const monthToDateAmount = resultsByTime.reduce((sum, day) => {
    const dayDate = day.TimePeriod?.Start ?? "";
    if (dayDate < monthStartStr) {
      return sum;
    }
    const groups = day.Groups ?? [];
    return sum + groups.reduce(
      (daySum, g) => daySum + Number.parseFloat(g.Metrics?.UnblendedCost?.Amount ?? "0"), 0,
    );
  }, 0);

  return {
    date: yesterdayStr,
    totalAmount,
    services: topServices,
    currency,
    weeklyHistory,
    weeklyServiceHistory,
    monthToDateAmount,
  };
}
