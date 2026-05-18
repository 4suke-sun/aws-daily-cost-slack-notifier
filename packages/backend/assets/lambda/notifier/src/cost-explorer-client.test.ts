import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getAllCostData } from "./cost-explorer-client.js";

import type { GetCostAndUsageResponse, ResultByTime } from "@aws-sdk/client-cost-explorer";

const ceMock = mockClient(CostExplorerClient);

/**
 * Build a multi-day MTD response with ResultsByTime entries.
 * Each entry has the given services with the same amounts for simplicity.
 */
function buildMultiDayResponse(
  startDate: string,
  days: { date: string; services: Record<string, string> }[],
): GetCostAndUsageResponse {
  const resultsByTime: ResultByTime[] = days.map((day) => {
    const nextDay = new Date(day.date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const endStr = `${nextDay.getUTCFullYear()}-${String(nextDay.getUTCMonth() + 1).padStart(2, "0")}-${String(nextDay.getUTCDate()).padStart(2, "0")}`;
    return {
      TimePeriod: { Start: day.date, End: endStr },
      Groups: Object.entries(day.services).map(([name, amount]) => ({
        Keys: [name],
        Metrics: {
          UnblendedCost: { Amount: amount, Unit: "USD" },
        },
      })),
    };
  });

  return { ResultsByTime: resultsByTime };
}

beforeEach(() => {
  ceMock.reset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("getAllCostData", () => {
  test("day 15 of month (day 8+): single API call, weekOverWeekChange from MTD data", async () => {
    // Set today to Jan 15, 2024 - yesterday is Jan 14
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    // Build 14 days of data (Jan 1 to Jan 14)
    const days = [];
    for (let d = 1; d <= 14; d++) {
      const dateStr = `2024-01-${String(d).padStart(2, "0")}`;
      days.push({
        date: dateStr,
        services: {
          "Amazon EC2": "10.00",
          "Amazon S3": "5.00",
        },
      });
    }
    // Make day 7 (Jan 7) have different values for week-over-week comparison
    days[6] = { date: "2024-01-07", services: { "Amazon EC2": "8.00", "Amazon S3": "4.00" } };
    // Make day 13 (Jan 13) different for day-over-day comparison
    days[12] = { date: "2024-01-13", services: { "Amazon EC2": "9.00", "Amazon S3": "4.50" } };

    const mtdResponse = buildMultiDayResponse("2024-01-01", days);
    ceMock.on(GetCostAndUsageCommand).resolves(mtdResponse);

    const result = await getAllCostData(5);

    expect(result.date).toBe("2024-01-14");
    expect(result.totalAmount).toBeCloseTo(15.0);
    expect(result.services[0].serviceName).toBe("Amazon EC2");
    expect(result.services[0].amount).toBe(10.0);
    // Day-over-day: 10/9 - 1 = 11.11%
    expect(result.services[0].dayOverDayChange).toBeCloseTo(11.11, 1);
    // Week-over-week: 10/8 - 1 = 25%
    expect(result.services[0].weekOverWeekChange).toBeCloseTo(25.0);
    expect(result.monthToDateAmount).toBeGreaterThan(0);
    expect(result.weeklyHistory.length).toBeLessThanOrEqual(7);
    // Only 1 API call should have been made
    expect(ceMock.commandCalls(GetCostAndUsageCommand)).toHaveLength(1);
  });

  test("day 3 of month with ENABLE_WEEK_OVER_WEEK=false: single API call, weekOverWeekChange is null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-03T12:00:00Z"));
    vi.stubEnv("ENABLE_WEEK_OVER_WEEK", "false");

    // queryStart = min(Jan 1, Dec 27) = Dec 27, so we need 7 days of data (Dec 27 - Jan 2)
    const days = [
      { date: "2023-12-27", services: { "Amazon EC2": "6.00", "Amazon S3": "3.00" } },
      { date: "2023-12-28", services: { "Amazon EC2": "6.00", "Amazon S3": "3.00" } },
      { date: "2023-12-29", services: { "Amazon EC2": "6.00", "Amazon S3": "3.00" } },
      { date: "2023-12-30", services: { "Amazon EC2": "7.00", "Amazon S3": "3.50" } },
      { date: "2023-12-31", services: { "Amazon EC2": "7.00", "Amazon S3": "3.50" } },
      { date: "2024-01-01", services: { "Amazon EC2": "8.00", "Amazon S3": "4.00" } },
      { date: "2024-01-02", services: { "Amazon EC2": "10.00", "Amazon S3": "5.00" } },
    ];

    const mtdResponse = buildMultiDayResponse("2023-12-27", days);
    ceMock.on(GetCostAndUsageCommand).resolves(mtdResponse);

    const result = await getAllCostData(5);

    expect(result.date).toBe("2024-01-02");
    expect(result.services[0].weekOverWeekChange).toBeNull();
    expect(result.services[1].weekOverWeekChange).toBeNull();
    // monthToDateAmount only sums days >= 2024-01-01 (Jan 1 + Jan 2)
    expect(result.monthToDateAmount).toBeCloseTo(27.0); // EC2(8+10) + S3(4+5)
    // weeklyHistory has 7 entries (Dec 27 - Jan 2)
    expect(result.weeklyHistory).toHaveLength(7);
    // Only 1 API call
    expect(ceMock.commandCalls(GetCostAndUsageCommand)).toHaveLength(1);
  });

  test("day 3 of month with ENABLE_WEEK_OVER_WEEK=true: two API calls, weekOverWeekChange calculated", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-03T12:00:00Z"));
    vi.stubEnv("ENABLE_WEEK_OVER_WEEK", "true");

    // queryStart = min(Jan 1, Dec 27) = Dec 27, so we need 7 days of data (Dec 27 - Jan 2)
    const days = [
      { date: "2023-12-27", services: { "Amazon EC2": "6.00", "Amazon S3": "3.00" } },
      { date: "2023-12-28", services: { "Amazon EC2": "6.00", "Amazon S3": "3.00" } },
      { date: "2023-12-29", services: { "Amazon EC2": "6.00", "Amazon S3": "3.00" } },
      { date: "2023-12-30", services: { "Amazon EC2": "7.00", "Amazon S3": "3.50" } },
      { date: "2023-12-31", services: { "Amazon EC2": "7.00", "Amazon S3": "3.50" } },
      { date: "2024-01-01", services: { "Amazon EC2": "8.00", "Amazon S3": "4.00" } },
      { date: "2024-01-02", services: { "Amazon EC2": "10.00", "Amazon S3": "5.00" } },
    ];
    const mtdResponse = buildMultiDayResponse("2023-12-27", days);

    // Last week response (Dec 26): single day
    const lastWeekResponse: GetCostAndUsageResponse = {
      ResultsByTime: [{
        TimePeriod: { Start: "2023-12-26", End: "2023-12-27" },
        Groups: [
          { Keys: ["Amazon EC2"], Metrics: { UnblendedCost: { Amount: "5.00", Unit: "USD" } } },
          { Keys: ["Amazon S3"], Metrics: { UnblendedCost: { Amount: "2.50", Unit: "USD" } } },
        ],
      }],
    };

    ceMock.on(GetCostAndUsageCommand)
      .resolvesOnce(mtdResponse)
      .resolvesOnce(lastWeekResponse);

    const result = await getAllCostData(5);

    expect(result.date).toBe("2024-01-02");
    // Week-over-week: EC2 10/5 - 1 = 100%
    expect(result.services[0].weekOverWeekChange).toBeCloseTo(100.0);
    // Week-over-week: S3 5/2.5 - 1 = 100%
    expect(result.services[1].weekOverWeekChange).toBeCloseTo(100.0);
    // monthToDateAmount only sums days >= 2024-01-01
    expect(result.monthToDateAmount).toBeCloseTo(27.0); // EC2(8+10) + S3(4+5)
    // 2 API calls
    expect(ceMock.commandCalls(GetCostAndUsageCommand)).toHaveLength(2);
  });

  test("top N + Others aggregation works correctly", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    const days = [];
    for (let d = 1; d <= 14; d++) {
      const dateStr = `2024-01-${String(d).padStart(2, "0")}`;
      days.push({
        date: dateStr,
        services: {
          "Amazon EC2": "20.00",
          "Amazon S3": "15.00",
          "AWS Lambda": "10.00",
          "Amazon RDS": "5.00",
          "Amazon DynamoDB": "3.00",
          "Amazon CloudWatch": "2.00",
          "Amazon SNS": "1.00",
        },
      });
    }

    const mtdResponse = buildMultiDayResponse("2024-01-01", days);
    ceMock.on(GetCostAndUsageCommand).resolves(mtdResponse);

    const result = await getAllCostData(5);

    expect(result.services).toHaveLength(6); // 5 top + Others
    expect(result.services[5].serviceName).toBe("Others");
    expect(result.services[5].amount).toBe(3.00); // CloudWatch(2) + SNS(1)
    expect(result.totalAmount).toBe(56.00);
  });

  test("empty results handled gracefully (today is 1st of month)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Today is Jan 1, yesterday is Dec 31.
    // queryStart = min(Jan 1, Dec 25) = Dec 25, query covers Dec 25 - Jan 1.
    // Response has 7 days but all with empty groups.
    const emptyResponse: GetCostAndUsageResponse = {
      ResultsByTime: [
        { TimePeriod: { Start: "2023-12-25", End: "2023-12-26" }, Groups: [] },
        { TimePeriod: { Start: "2023-12-26", End: "2023-12-27" }, Groups: [] },
        { TimePeriod: { Start: "2023-12-27", End: "2023-12-28" }, Groups: [] },
        { TimePeriod: { Start: "2023-12-28", End: "2023-12-29" }, Groups: [] },
        { TimePeriod: { Start: "2023-12-29", End: "2023-12-30" }, Groups: [] },
        { TimePeriod: { Start: "2023-12-30", End: "2023-12-31" }, Groups: [] },
        { TimePeriod: { Start: "2023-12-31", End: "2024-01-01" }, Groups: [] },
      ],
    };

    ceMock.on(GetCostAndUsageCommand).resolves(emptyResponse);

    const result = await getAllCostData(5);

    expect(result.date).toBe("2023-12-31");
    expect(result.services).toHaveLength(0);
    expect(result.totalAmount).toBe(0);
    // monthToDateAmount is 0 because no days in the result are >= 2024-01-01
    expect(result.monthToDateAmount).toBe(0);
    expect(result.weeklyHistory).toHaveLength(7);
    expect(result.weeklyHistory[0].amount).toBe(0);
  });

  test("1st of month with real service data: monthToDateAmount is 0, dayOverDayChange is null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));

    // Today is Jan 1, yesterday is Dec 31.
    // queryStart = min(Jan 1, Dec 25) = Dec 25, query covers Dec 25 - Jan 1.
    // All results are from the prior month.
    const days = [
      { date: "2023-12-25", services: { "Amazon EC2": "8.00", "Amazon S3": "4.00", "AWS Lambda": "2.00" } },
      { date: "2023-12-26", services: { "Amazon EC2": "9.00", "Amazon S3": "4.50", "AWS Lambda": "2.50" } },
      { date: "2023-12-27", services: { "Amazon EC2": "10.00", "Amazon S3": "5.00", "AWS Lambda": "3.00" } },
      { date: "2023-12-28", services: { "Amazon EC2": "11.00", "Amazon S3": "5.50", "AWS Lambda": "3.50" } },
      { date: "2023-12-29", services: { "Amazon EC2": "10.00", "Amazon S3": "5.00", "AWS Lambda": "3.00" } },
      { date: "2023-12-30", services: { "Amazon EC2": "12.00", "Amazon S3": "6.00", "AWS Lambda": "4.00" } },
      { date: "2023-12-31", services: { "Amazon EC2": "15.00", "Amazon S3": "7.00", "AWS Lambda": "5.00" } },
    ];

    const mtdResponse = buildMultiDayResponse("2023-12-25", days);
    ceMock.on(GetCostAndUsageCommand).resolves(mtdResponse);

    const result = await getAllCostData(5);

    // Yesterday is Dec 31 (prior month)
    expect(result.date).toBe("2023-12-31");
    // Total amount is yesterday's total (Dec 31): 15 + 7 + 5 = 27
    expect(result.totalAmount).toBe(27.0);
    // Services should have real data from yesterday
    expect(result.services).toHaveLength(3);
    expect(result.services[0].serviceName).toBe("Amazon EC2");
    expect(result.services[0].amount).toBe(15.0);
    // dayOverDayChange compares Dec 31 to Dec 30 (both present in results)
    // EC2: 15/12 - 1 = 25%
    expect(result.services[0].dayOverDayChange).toBeCloseTo(25.0);
    // monthToDateAmount must be 0 since no days belong to January
    expect(result.monthToDateAmount).toBe(0);
    // weeklyHistory has 7 entries (Dec 25-31)
    expect(result.weeklyHistory).toHaveLength(7);
    expect(result.weeklyHistory[0].date).toBe("2023-12-25");
    expect(result.weeklyHistory[6].date).toBe("2023-12-31");
    // Only 1 API call
    expect(ceMock.commandCalls(GetCostAndUsageCommand)).toHaveLength(1);
  });

  test("weeklyHistory returns last 7 days of daily totals", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));

    const days = [];
    for (let d = 1; d <= 14; d++) {
      const dateStr = `2024-01-${String(d).padStart(2, "0")}`;
      days.push({
        date: dateStr,
        services: { "Amazon EC2": String(d) }, // amount = day number
      });
    }

    const mtdResponse = buildMultiDayResponse("2024-01-01", days);
    ceMock.on(GetCostAndUsageCommand).resolves(mtdResponse);

    const result = await getAllCostData(5);

    // Last 7 days: Jan 8-14
    expect(result.weeklyHistory).toHaveLength(7);
    expect(result.weeklyHistory[0].date).toBe("2024-01-08");
    expect(result.weeklyHistory[0].amount).toBe(8);
    expect(result.weeklyHistory[6].date).toBe("2024-01-14");
    expect(result.weeklyHistory[6].amount).toBe(14);
  });
});
