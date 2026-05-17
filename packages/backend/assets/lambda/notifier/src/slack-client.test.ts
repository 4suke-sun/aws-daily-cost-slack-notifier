import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { buildSlackBlocks, sendSlackNotification } from "./slack-client.js";

import type { CostData } from "./cost-explorer-client.js";
import type { SlackMessageOptions } from "./slack-client.js";

const mockCostData: CostData = {
  yesterday: [
    { serviceName: "Amazon EC2", amount: 10.5 },
    { serviceName: "Amazon S3", amount: 3.2 },
    { serviceName: "AWS Lambda", amount: 1.0 },
  ],
  dayBeforeYesterday: [],
  lastWeekSameDay: [],
  yesterdayTotal: 14.7,
  dayBeforeYesterdayTotal: 11.8,
  lastWeekSameDayTotal: 10.5,
};

const mockOptions: SlackMessageOptions = {
  costData: mockCostData,
  exchangeRate: 150.0,
};

describe("slack-client", () => {
  describe("buildSlackBlocks", () => {
    test("正常系: Slack Block Kit メッセージを構築できる", () => {
      const blocks = buildSlackBlocks(mockOptions);

      expect(blocks).toHaveLength(5);
      expect(blocks[0]).toEqual({
        type: "header",
        text: { type: "plain_text", text: "AWS Daily Cost Report" },
      });
    });

    test("合計金額・前日比・前週比が含まれる", () => {
      const blocks = buildSlackBlocks(mockOptions);
      const summaryBlock = blocks[1];

      expect(summaryBlock.text?.text).toContain("$14.70");
      expect(summaryBlock.text?.text).toContain("\u00a52205.00");
      expect(summaryBlock.text?.text).toContain("前日比");
      expect(summaryBlock.text?.text).toContain("前週同曜日比");
      expect(summaryBlock.text?.text).toContain("150.00 JPY");
    });

    test("サービス別コストが含まれる", () => {
      const blocks = buildSlackBlocks(mockOptions);
      const serviceBlock = blocks[3];

      expect(serviceBlock.text?.text).toContain("Amazon EC2");
      expect(serviceBlock.text?.text).toContain("$10.50");
      expect(serviceBlock.text?.text).toContain("Amazon S3");
      expect(serviceBlock.text?.text).toContain("AWS Lambda");
    });

    test("前日コストがゼロの場合、変化率はN/Aになる", () => {
      const options: SlackMessageOptions = {
        costData: {
          ...mockCostData,
          dayBeforeYesterdayTotal: 0,
        },
        exchangeRate: 150.0,
      };

      const blocks = buildSlackBlocks(options);
      expect(blocks[1].text?.text).toContain("N/A");
    });

    test("サービスが空の場合", () => {
      const options: SlackMessageOptions = {
        costData: {
          ...mockCostData,
          yesterday: [],
        },
        exchangeRate: 150.0,
      };

      const blocks = buildSlackBlocks(options);
      expect(blocks[3].text?.text).toContain("データなし");
    });
  });

  describe("sendSlackNotification", () => {
    beforeEach(() => {
      vi.stubGlobal("fetch", vi.fn());
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    test("正常系: Slack webhook に POST する", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
      });
      vi.stubGlobal("fetch", mockFetch);

      await sendSlackNotification("https://hooks.slack.com/test", mockOptions);

      expect(mockFetch).toHaveBeenCalledWith(
        "https://hooks.slack.com/test",
        expect.objectContaining({
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }),
      );

      const callArgs = mockFetch.mock.calls[0]?.[1] as { body: string } | undefined;
      const body = JSON.parse(callArgs?.body ?? "{}") as { blocks: unknown[] };
      expect(body.blocks).toBeDefined();
      expect(body.blocks).toHaveLength(5);
    });

    test("HTTP エラー時に例外を投げる", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        sendSlackNotification("https://hooks.slack.com/test", mockOptions),
      ).rejects.toThrow("Slack webhook failed with status 500: Internal Server Error");
    });

    test("タイムアウト時に例外を投げる", async () => {
      const mockFetch = vi.fn().mockImplementation(() => {
        const error = new DOMException("The operation was aborted.", "AbortError");
        return Promise.reject(error);
      });
      vi.stubGlobal("fetch", mockFetch);

      await expect(
        sendSlackNotification("https://hooks.slack.com/test", mockOptions),
      ).rejects.toThrow("Slack webhook request timed out");
    });
  });
});
