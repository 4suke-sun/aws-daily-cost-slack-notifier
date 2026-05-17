import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { filterTopN, getCostData } from "./cost-explorer-client.js";

import type { GetCostAndUsageCommandOutput } from "@aws-sdk/client-cost-explorer";

const ceMock = mockClient(CostExplorerClient);

function createMockResponse(groups: { key: string; amount: string }[]): GetCostAndUsageCommandOutput {
  return {
    $metadata: {},
    ResultsByTime: [
      {
        Groups: groups.map((g) => ({
          Keys: [g.key],
          Metrics: {
            UnblendedCost: { Amount: g.amount, Unit: "USD" },
          },
        })),
      },
    ],
  };
}

describe("cost-explorer-client", () => {
  beforeEach(() => {
    ceMock.reset();
  });

  afterEach(() => {
    ceMock.restore();
  });

  describe("getCostData", () => {
    test("正常系: サービス別コストを取得できる", async () => {
      const yesterdayGroups = [
        { key: "Amazon EC2", amount: "10.50" },
        { key: "Amazon S3", amount: "3.20" },
        { key: "AWS Lambda", amount: "1.00" },
      ];
      const dayBeforeGroups = [
        { key: "Amazon EC2", amount: "9.00" },
        { key: "Amazon S3", amount: "2.80" },
      ];
      const lastWeekGroups = [
        { key: "Amazon EC2", amount: "8.00" },
        { key: "Amazon S3", amount: "2.50" },
      ];

      ceMock
        .on(GetCostAndUsageCommand)
        .resolvesOnce(createMockResponse(yesterdayGroups))
        .resolvesOnce(createMockResponse(dayBeforeGroups))
        .resolvesOnce(createMockResponse(lastWeekGroups));

      const today = new Date("2024-03-15T00:00:00Z");
      const result = await getCostData(today);

      expect(result.yesterday).toHaveLength(3);
      expect(result.yesterday[0]).toEqual({ serviceName: "Amazon EC2", amount: 10.50 });
      expect(result.yesterday[1]).toEqual({ serviceName: "Amazon S3", amount: 3.20 });
      expect(result.yesterday[2]).toEqual({ serviceName: "AWS Lambda", amount: 1.00 });
      expect(result.yesterdayTotal).toBeCloseTo(14.70);
      expect(result.dayBeforeYesterdayTotal).toBeCloseTo(11.80);
      expect(result.lastWeekSameDayTotal).toBeCloseTo(10.50);
    });

    test("正常系: Top N でサービスを絞り込める", async () => {
      const groups = [
        { key: "Service A", amount: "100.00" },
        { key: "Service B", amount: "50.00" },
        { key: "Service C", amount: "30.00" },
        { key: "Service D", amount: "10.00" },
        { key: "Service E", amount: "5.00" },
      ];

      ceMock
        .on(GetCostAndUsageCommand)
        .resolves(createMockResponse(groups));

      const today = new Date("2024-03-15T00:00:00Z");
      const result = await getCostData(today, 3);

      expect(result.yesterday).toHaveLength(3);
      expect(result.yesterday[0].serviceName).toBe("Service A");
      expect(result.yesterday[1].serviceName).toBe("Service B");
      expect(result.yesterday[2].serviceName).toBe("Service C");
    });

    test("空のレスポンスの場合はゼロとして処理する", async () => {
      const emptyResponse: GetCostAndUsageCommandOutput = {
        $metadata: {},
        ResultsByTime: [{ Groups: [] }],
      };

      ceMock
        .on(GetCostAndUsageCommand)
        .resolves(emptyResponse);

      const today = new Date("2024-03-15T00:00:00Z");
      const result = await getCostData(today);

      expect(result.yesterday).toHaveLength(0);
      expect(result.yesterdayTotal).toBe(0);
      expect(result.dayBeforeYesterdayTotal).toBe(0);
      expect(result.lastWeekSameDayTotal).toBe(0);
    });

    test("API エラー時は例外が伝搬する", async () => {
      ceMock
        .on(GetCostAndUsageCommand)
        .rejects(new Error("AccessDeniedException"));

      const today = new Date("2024-03-15T00:00:00Z");
      await expect(getCostData(today)).rejects.toThrow("AccessDeniedException");
    });
  });

  describe("filterTopN", () => {
    test("コスト降順でTop Nを返す", () => {
      const services = [
        { serviceName: "A", amount: 5 },
        { serviceName: "B", amount: 20 },
        { serviceName: "C", amount: 10 },
        { serviceName: "D", amount: 1 },
      ];

      const result = filterTopN(services, 2);
      expect(result).toEqual([
        { serviceName: "B", amount: 20 },
        { serviceName: "C", amount: 10 },
      ]);
    });

    test("N が配列長以上の場合は全件返す", () => {
      const services = [
        { serviceName: "A", amount: 5 },
        { serviceName: "B", amount: 10 },
      ];

      const result = filterTopN(services, 100);
      expect(result).toHaveLength(2);
    });
  });
});
