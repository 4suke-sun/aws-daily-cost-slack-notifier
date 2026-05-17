import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { formatSlackMessage, postToSlack } from "./slack-client.js";

import type { SlackCostData } from "./slack-client.js";

const sampleData: SlackCostData = {
  date: "2024-01-15",
  services: [
    { name: "Amazon EC2", amount: 10.50, dayOverDayChange: 25.0, weekOverWeekChange: -10.0 },
    { name: "Amazon S3", amount: 5.25, dayOverDayChange: null, weekOverWeekChange: 50.0 },
  ],
  totalAmount: 15.75,
  monthToDateAmount: 210.50,
  currency: "USD",
  jpyRate: 149.5,
  weeklyHistory: [
    { date: "2024-01-09", amount: 12.00 },
    { date: "2024-01-10", amount: 14.50 },
    { date: "2024-01-11", amount: 13.20 },
    { date: "2024-01-12", amount: 16.00 },
    { date: "2024-01-13", amount: 11.80 },
    { date: "2024-01-14", amount: 15.00 },
    { date: "2024-01-15", amount: 15.75 },
  ],
};

describe("postToSlack", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("sends correct payload to webhook URL", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("ok", { status: 200 }));

    await postToSlack("https://hooks.slack.com/services/test", sampleData);

    const expectedPayload = formatSlackMessage(sampleData);
    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(expectedPayload),
      }),
    );
  });

  test("throws on non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("error", { status: 500 }));

    await expect(
      postToSlack("https://hooks.slack.com/services/test", sampleData),
    ).rejects.toThrow("Slack webhook returned status 500");
  });
});

describe("formatSlackMessage", () => {
  test("produces valid block structure with header, chart, services, and total", () => {
    const result = formatSlackMessage(sampleData);

    expect(result.blocks).toBeDefined();
    expect(result.blocks.length).toBeGreaterThan(0);

    // ヘッダー
    const header = result.blocks[0];
    expect(header.type).toBe("header");
    if (header.type !== "header") throw new Error("unexpected block type");
    expect(header.text.text).toContain("2024-01-15");
    expect(header.text.text).toContain("コスト日報");

    // グラフ画像
    const imageBlock = result.blocks[1];
    expect(imageBlock.type).toBe("image");
    if (imageBlock.type !== "image") throw new Error("unexpected block type");
    expect(imageBlock.image_url).toContain("quickchart.io");

    // 合計（最後のブロック）
    const contextBlock = result.blocks[result.blocks.length - 1];
    expect(contextBlock.type).toBe("context");
    const elements = (contextBlock as unknown as { elements: { text: string }[] }).elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].text).toContain("$15.75");
    expect(elements[0].text).toContain("JPY");
    expect(elements[0].text).toContain("Credit/Refund 除外");
    expect(elements[0].text).toContain("月累計");
    expect(elements[0].text).toContain("$210.50");
  });

  test("formats changes in Japanese with appropriate indicators", () => {
    const result = formatSlackMessage(sampleData);

    // サービス別ブロックを探す（section で Amazon EC2 を含むもの）
    const ec2Block = result.blocks.find(
      (b) => b.type === "section" && "text" in b && b.text.text.includes("Amazon EC2"),
    );
    expect(ec2Block).toBeDefined();
    if (ec2Block?.type !== "section") throw new Error("unexpected block type");
    expect(ec2Block.text.text).toContain("+25.0%");
    expect(ec2Block.text.text).toContain("-10.0%");
    expect(ec2Block.text.text).toContain("前日比");
    expect(ec2Block.text.text).toContain("前週比");

    const s3Block = result.blocks.find(
      (b) => b.type === "section" && "text" in b && b.text.text.includes("Amazon S3"),
    );
    expect(s3Block).toBeDefined();
    if (s3Block?.type !== "section") throw new Error("unexpected block type");
    expect(s3Block.text.text).toContain("ー"); // null change
    expect(s3Block.text.text).toContain("+50.0%");
  });

  test("handles empty weekly history without chart", () => {
    const dataNoHistory: SlackCostData = { ...sampleData, weeklyHistory: [] };
    const result = formatSlackMessage(dataNoHistory);

    const imageBlocks = result.blocks.filter((b) => b.type === "image");
    expect(imageBlocks).toHaveLength(0);
  });
});
