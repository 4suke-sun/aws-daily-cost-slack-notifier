import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { formatSlackMessage, postToSlack } from "./slack-client.js";

import type { SlackCostData } from "./slack-client.js";

const sampleData: SlackCostData = {
  date: "2024-01-15",
  services: [
    { name: "Amazon EC2", amount: 10.50, dayOverDayChange: 25.0, weekOverWeekChange: -10.0 },
    { name: "Amazon S3", amount: 5.25, dayOverDayChange: null, weekOverWeekChange: 50.0 },
  ],
  topN: 5,
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
  weeklyServiceHistory: [
    { date: "2024-01-09", services: { "Amazon EC2": 8.00, "Amazon S3": 4.00 }, total: 12.00 },
    { date: "2024-01-10", services: { "Amazon EC2": 9.50, "Amazon S3": 5.00 }, total: 14.50 },
    { date: "2024-01-11", services: { "Amazon EC2": 8.20, "Amazon S3": 5.00 }, total: 13.20 },
    { date: "2024-01-12", services: { "Amazon EC2": 10.00, "Amazon S3": 6.00 }, total: 16.00 },
    { date: "2024-01-13", services: { "Amazon EC2": 7.80, "Amazon S3": 4.00 }, total: 11.80 },
    { date: "2024-01-14", services: { "Amazon EC2": 10.00, "Amazon S3": 5.00 }, total: 15.00 },
    { date: "2024-01-15", services: { "Amazon EC2": 10.50, "Amazon S3": 5.25 }, total: 15.75 },
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
    const dataNoHistory: SlackCostData = { ...sampleData, weeklyHistory: [], weeklyServiceHistory: [] };
    const result = formatSlackMessage(dataNoHistory);

    const imageBlocks = result.blocks.filter((b) => b.type === "image");
    expect(imageBlocks).toHaveLength(0);
  });

  test("service breakdown header contains topN value", () => {
    const result = formatSlackMessage(sampleData);

    const breakdownHeader = result.blocks.find(
      (b) => b.type === "section" && "text" in b && b.text.text.includes("サービス別内訳"),
    );
    expect(breakdownHeader).toBeDefined();
    if (breakdownHeader?.type !== "section") throw new Error("unexpected block type");
    expect(breakdownHeader.text.text).toContain("上位5件");
    expect(breakdownHeader.text.text).toContain("前日利用料");
  });

  test("chart uses period-wide Top N: high-cost service absent on last day falls into Others when outside topN", () => {
    // topN=2の場合、期間合計Top2はEC2とS3 → Claude HaikuはOthersに入る
    const dataWithBedrock: SlackCostData = {
      ...sampleData,
      topN: 2,
      services: [
        { name: "Amazon EC2", amount: 10.50, dayOverDayChange: null, weekOverWeekChange: null },
        { name: "Amazon S3", amount: 5.25, dayOverDayChange: null, weekOverWeekChange: null },
      ],
      weeklyServiceHistory: [
        { date: "2024-01-09", services: { "Amazon EC2": 8.00, "Amazon S3": 4.00 }, total: 12.00 },
        { date: "2024-01-10", services: { "Amazon EC2": 9.50, "Amazon S3": 5.00 }, total: 14.50 },
        { date: "2024-01-11", services: { "Amazon EC2": 8.20, "Amazon S3": 5.00 }, total: 13.20 },
        // 1/12: Claude Haikuが発生するが期間合計はEC2・S3に届かない
        { date: "2024-01-12", services: { "Amazon EC2": 5.00, "Amazon S3": 2.00, "Claude Haiku 4.5 (Amazon Bedrock Edition)": 9.00 }, total: 16.00 },
        { date: "2024-01-13", services: { "Amazon EC2": 7.80, "Amazon S3": 4.00 }, total: 11.80 },
        { date: "2024-01-14", services: { "Amazon EC2": 10.00, "Amazon S3": 5.00 }, total: 15.00 },
        { date: "2024-01-15", services: { "Amazon EC2": 10.50, "Amazon S3": 5.25 }, total: 15.75 },
      ],
    };

    const result = formatSlackMessage(dataWithBedrock);
    const imageBlock = result.blocks.find((b) => b.type === "image");
    expect(imageBlock).toBeDefined();
    if (imageBlock?.type !== "image") throw new Error("unexpected block type");

    // topN=2: EC2・S3が名前付き、Claude HaikuはOthersに入る
    expect(imageBlock.image_url).toContain(encodeURIComponent("Amazon EC2"));
    expect(imageBlock.image_url).toContain(encodeURIComponent("Amazon S3"));
    expect(imageBlock.image_url).toContain(encodeURIComponent("Others"));
    expect(imageBlock.image_url).not.toContain(encodeURIComponent("Claude Haiku"));
  });

  test("chart uses period-wide Top N: high-cost service mid-week appears as named segment when within topN", () => {
    // topN=3で期間中にClaude Haikuが十分高額 → 期間Top3に入るので名前付きで表示される
    const dataWithBedrock: SlackCostData = {
      ...sampleData,
      topN: 3,
      services: [
        { name: "Amazon EC2", amount: 10.50, dayOverDayChange: null, weekOverWeekChange: null },
        { name: "Amazon S3", amount: 5.25, dayOverDayChange: null, weekOverWeekChange: null },
      ],
      weeklyServiceHistory: [
        { date: "2024-01-09", services: { "Amazon EC2": 8.00, "Amazon S3": 4.00 }, total: 12.00 },
        { date: "2024-01-10", services: { "Amazon EC2": 9.50, "Amazon S3": 5.00 }, total: 14.50 },
        { date: "2024-01-11", services: { "Amazon EC2": 8.20, "Amazon S3": 5.00 }, total: 13.20 },
        // 1/12: Claude Haikuが十分高額発生 → 期間合計でTop3に入る
        { date: "2024-01-12", services: { "Amazon EC2": 5.00, "Amazon S3": 2.00, "Claude Haiku 4.5 (Amazon Bedrock Edition)": 20.00 }, total: 27.00 },
        { date: "2024-01-13", services: { "Amazon EC2": 7.80, "Amazon S3": 4.00 }, total: 11.80 },
        { date: "2024-01-14", services: { "Amazon EC2": 10.00, "Amazon S3": 5.00 }, total: 15.00 },
        { date: "2024-01-15", services: { "Amazon EC2": 10.50, "Amazon S3": 5.25 }, total: 15.75 },
      ],
    };

    const result = formatSlackMessage(dataWithBedrock);
    const imageBlock = result.blocks.find((b) => b.type === "image");
    expect(imageBlock).toBeDefined();
    if (imageBlock?.type !== "image") throw new Error("unexpected block type");

    // 期間合計: EC2≈59, S3≈30.25, Claude Haiku=20 → Top3全員が名前付き
    expect(imageBlock.image_url).toContain(encodeURIComponent("Amazon EC2"));
    expect(imageBlock.image_url).toContain(encodeURIComponent("Claude Haiku 4.5 (Amazon Bedrock Edition)"));
  });
});
