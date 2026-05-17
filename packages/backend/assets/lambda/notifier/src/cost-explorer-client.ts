import {
  CostExplorerClient,
  GetCostAndUsageCommand,
} from "@aws-sdk/client-cost-explorer";

import type { GetCostAndUsageCommandOutput } from "@aws-sdk/client-cost-explorer";

export interface ServiceCost {
  serviceName: string;
  amount: number;
}

export interface CostData {
  yesterday: ServiceCost[];
  dayBeforeYesterday: ServiceCost[];
  lastWeekSameDay: ServiceCost[];
  yesterdayTotal: number;
  dayBeforeYesterdayTotal: number;
  lastWeekSameDayTotal: number;
}

const client = new CostExplorerClient({ region: "us-east-1" });

function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateRange(baseDate: Date, daysAgo: number): { start: string; end: string } {
  const end = new Date(baseDate);
  end.setDate(end.getDate() - daysAgo);
  const start = new Date(end);
  start.setDate(start.getDate() - 1);
  return { start: formatDate(start), end: formatDate(end) };
}

function parseServiceCosts(response: GetCostAndUsageCommandOutput): ServiceCost[] {
  const results = response.ResultsByTime?.[0]?.Groups ?? [];
  return results.map((group) => ({
    serviceName: group.Keys?.[0] ?? "Unknown",
    amount: parseFloat(group.Metrics?.UnblendedCost?.Amount ?? "0"),
  }));
}

function calculateTotal(services: ServiceCost[]): number {
  return services.reduce((sum, s) => sum + s.amount, 0);
}

async function fetchCostForPeriod(start: string, end: string): Promise<GetCostAndUsageCommandOutput> {
  const command = new GetCostAndUsageCommand({
    TimePeriod: { Start: start, End: end },
    Granularity: "DAILY",
    Metrics: ["UnblendedCost"],
    GroupBy: [{ Type: "DIMENSION", Key: "SERVICE" }],
  });
  return client.send(command);
}

export function filterTopN(services: ServiceCost[], n: number): ServiceCost[] {
  return [...services]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, n);
}

export async function getCostData(today?: Date, topN = 10): Promise<CostData> {
  const baseDate = today ?? new Date();

  const yesterdayRange = getDateRange(baseDate, 0);
  const dayBeforeRange = getDateRange(baseDate, 1);
  const lastWeekRange = getDateRange(baseDate, 6);

  const [yesterdayResponse, dayBeforeResponse, lastWeekResponse] = await Promise.all([
    fetchCostForPeriod(yesterdayRange.start, yesterdayRange.end),
    fetchCostForPeriod(dayBeforeRange.start, dayBeforeRange.end),
    fetchCostForPeriod(lastWeekRange.start, lastWeekRange.end),
  ]);

  const yesterday = parseServiceCosts(yesterdayResponse);
  const dayBeforeYesterday = parseServiceCosts(dayBeforeResponse);
  const lastWeekSameDay = parseServiceCosts(lastWeekResponse);

  return {
    yesterday: filterTopN(yesterday, topN),
    dayBeforeYesterday,
    lastWeekSameDay,
    yesterdayTotal: calculateTotal(yesterday),
    dayBeforeYesterdayTotal: calculateTotal(dayBeforeYesterday),
    lastWeekSameDayTotal: calculateTotal(lastWeekSameDay),
  };
}
