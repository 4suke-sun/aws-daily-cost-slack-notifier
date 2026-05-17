import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";

import type { GetCostAndUsageResponse } from "@aws-sdk/client-cost-explorer";

export interface ServiceCost {
  serviceName: string;
  amount: number;
  unit: string;
  dayOverDayChange: number | null;
  weekOverWeekChange: number | null;
}

export interface CostResult {
  date: string;
  totalAmount: number;
  services: ServiceCost[];
  currency: string;
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseCostsByService(response: GetCostAndUsageResponse): Map<string, number> {
  const costs = new Map<string, number>();
  const groups = response.ResultsByTime?.[0]?.Groups ?? [];
  for (const group of groups) {
    const serviceName = group.Keys?.[0] ?? "Unknown";
    const amount = parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0");
    costs.set(serviceName, amount);
  }
  return costs;
}

function calculateChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return ((current - previous) / previous) * 100;
}

const client = new CostExplorerClient({});

export async function getDailyCosts(topN = 5): Promise<CostResult> {

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setUTCDate(today.getUTCDate() - 1);
  const dayBeforeYesterday = new Date(today);
  dayBeforeYesterday.setUTCDate(today.getUTCDate() - 2);
  const sameDayLastWeek = new Date(today);
  sameDayLastWeek.setUTCDate(today.getUTCDate() - 8);
  const dayAfterSameDayLastWeek = new Date(today);
  dayAfterSameDayLastWeek.setUTCDate(today.getUTCDate() - 7);

  const todayStr = formatDate(today);
  const yesterdayStr = formatDate(yesterday);
  const dayBeforeYesterdayStr = formatDate(dayBeforeYesterday);
  const sameDayLastWeekStr = formatDate(sameDayLastWeek);
  const dayAfterSameDayLastWeekStr = formatDate(dayAfterSameDayLastWeek);

  const baseParams = {
    Granularity: "DAILY" as const,
    Metrics: ["UnblendedCost"],
    GroupBy: [{ Type: "DIMENSION" as const, Key: "SERVICE" }],
  };

  const [yesterdayResponse, dayBeforeResponse, lastWeekResponse] = await Promise.all([
    client.send(new GetCostAndUsageCommand({
      ...baseParams,
      TimePeriod: { Start: yesterdayStr, End: todayStr },
    })),
    client.send(new GetCostAndUsageCommand({
      ...baseParams,
      TimePeriod: { Start: dayBeforeYesterdayStr, End: yesterdayStr },
    })),
    client.send(new GetCostAndUsageCommand({
      ...baseParams,
      TimePeriod: { Start: sameDayLastWeekStr, End: dayAfterSameDayLastWeekStr },
    })),
  ]);

  const yesterdayCosts = parseCostsByService(yesterdayResponse);
  const dayBeforeCosts = parseCostsByService(dayBeforeResponse);
  const lastWeekCosts = parseCostsByService(lastWeekResponse);

  const currency = yesterdayResponse.ResultsByTime?.[0]?.Groups?.[0]
    ?.Metrics?.UnblendedCost?.Unit ?? "USD";

  const services: ServiceCost[] = [];
  for (const [serviceName, amount] of yesterdayCosts.entries()) {
    const previousDayAmount = dayBeforeCosts.get(serviceName) ?? 0;
    const lastWeekAmount = lastWeekCosts.get(serviceName) ?? 0;
    services.push({
      serviceName,
      amount,
      unit: currency,
      dayOverDayChange: calculateChange(amount, previousDayAmount),
      weekOverWeekChange: calculateChange(amount, lastWeekAmount),
    });
  }

  services.sort((a, b) => b.amount - a.amount);

  const topServices = services.slice(0, topN);
  const otherServices = services.slice(topN);

  if (otherServices.length > 0) {
    const othersAmount = otherServices.reduce((sum, s) => sum + s.amount, 0);
    const previousOthersAmount = otherServices.reduce(
      (sum, s) => sum + (dayBeforeCosts.get(s.serviceName) ?? 0), 0,
    );
    const lastWeekOthersAmount = otherServices.reduce(
      (sum, s) => sum + (lastWeekCosts.get(s.serviceName) ?? 0), 0,
    );
    topServices.push({
      serviceName: "Others",
      amount: othersAmount,
      unit: currency,
      dayOverDayChange: calculateChange(othersAmount, previousOthersAmount),
      weekOverWeekChange: calculateChange(othersAmount, lastWeekOthersAmount),
    });
  }

  const totalAmount = services.reduce((sum, s) => sum + s.amount, 0);

  return {
    date: yesterdayStr,
    totalAmount,
    services: topServices,
    currency,
  };
}
