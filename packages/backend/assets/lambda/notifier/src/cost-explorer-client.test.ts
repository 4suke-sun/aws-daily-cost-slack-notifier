import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { mockClient } from "aws-sdk-client-mock";
import { beforeEach, describe, expect, test } from "vitest";

import { getDailyCosts } from "./cost-explorer-client.js";

import type { GetCostAndUsageResponse } from "@aws-sdk/client-cost-explorer";

const ceMock = mockClient(CostExplorerClient);

function buildResponse(services: Record<string, string>): GetCostAndUsageResponse {
  return {
    ResultsByTime: [{
      TimePeriod: { Start: "2024-01-01", End: "2024-01-02" },
      Groups: Object.entries(services).map(([name, amount]) => ({
        Keys: [name],
        Metrics: {
          UnblendedCost: { Amount: amount, Unit: "USD" },
        },
      })),
    }],
  };
}

beforeEach(() => {
  ceMock.reset();
});

describe("getDailyCosts", () => {
  test("returns top N services sorted by cost", async () => {
    const servicesData: Record<string, string> = {
      "Amazon EC2": "10.00",
      "Amazon S3": "5.00",
      "AWS Lambda": "3.00",
      "Amazon RDS": "2.00",
      "Amazon DynamoDB": "1.00",
    };

    ceMock.on(GetCostAndUsageCommand).resolves(buildResponse(servicesData));

    const result = await getDailyCosts(3);

    expect(result.services).toHaveLength(4);
    expect(result.services[0].serviceName).toBe("Amazon EC2");
    expect(result.services[0].amount).toBe(10.00);
    expect(result.services[1].serviceName).toBe("Amazon S3");
    expect(result.services[1].amount).toBe(5.00);
    expect(result.services[2].serviceName).toBe("AWS Lambda");
    expect(result.services[2].amount).toBe(3.00);
    expect(result.services[3].serviceName).toBe("Others");
    expect(result.services[3].amount).toBe(3.00);
  });

  test("calculates day-over-day change correctly", async () => {
    const yesterdayData = buildResponse({ "Amazon EC2": "10.00" });
    const dayBeforeData = buildResponse({ "Amazon EC2": "8.00" });
    const lastWeekData = buildResponse({ "Amazon EC2": "10.00" });

    ceMock.on(GetCostAndUsageCommand)
      .resolvesOnce(yesterdayData)
      .resolvesOnce(dayBeforeData)
      .resolvesOnce(lastWeekData);

    const result = await getDailyCosts(5);

    expect(result.services[0].dayOverDayChange).toBeCloseTo(25.0);
  });

  test("calculates week-over-week change correctly", async () => {
    const yesterdayData = buildResponse({ "Amazon EC2": "10.00" });
    const dayBeforeData = buildResponse({ "Amazon EC2": "10.00" });
    const lastWeekData = buildResponse({ "Amazon EC2": "5.00" });

    ceMock.on(GetCostAndUsageCommand)
      .resolvesOnce(yesterdayData)
      .resolvesOnce(dayBeforeData)
      .resolvesOnce(lastWeekData);

    const result = await getDailyCosts(5);

    expect(result.services[0].weekOverWeekChange).toBeCloseTo(100.0);
  });

  test("handles empty results gracefully", async () => {
    const emptyResponse: GetCostAndUsageResponse = {
      ResultsByTime: [{
        TimePeriod: { Start: "2024-01-01", End: "2024-01-02" },
        Groups: [],
      }],
    };

    ceMock.on(GetCostAndUsageCommand).resolves(emptyResponse);

    const result = await getDailyCosts(5);

    expect(result.services).toHaveLength(0);
    expect(result.totalAmount).toBe(0);
  });

  test("aggregates services beyond top N as Others", async () => {
    const servicesData: Record<string, string> = {
      "Amazon EC2": "20.00",
      "Amazon S3": "15.00",
      "AWS Lambda": "10.00",
      "Amazon RDS": "5.00",
      "Amazon DynamoDB": "3.00",
      "Amazon CloudWatch": "2.00",
      "Amazon SNS": "1.00",
    };

    ceMock.on(GetCostAndUsageCommand).resolves(buildResponse(servicesData));

    const result = await getDailyCosts(5);

    expect(result.services).toHaveLength(6);
    expect(result.services[5].serviceName).toBe("Others");
    expect(result.services[5].amount).toBe(3.00);
    expect(result.totalAmount).toBe(56.00);
  });
});
