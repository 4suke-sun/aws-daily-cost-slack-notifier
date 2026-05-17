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
  currency: "USD",
  jpyRate: 149.5,
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
  test("produces valid block structure with correct data", () => {
    const result = formatSlackMessage(sampleData);

    expect(result.blocks).toBeDefined();
    expect(result.blocks.length).toBeGreaterThan(0);

    const header = result.blocks[0];
    expect(header.type).toBe("header");
    if (header.type !== "header") throw new Error("unexpected block type");
    expect(header.text.text).toContain("2024-01-15");

    const serviceBlocks = result.blocks.slice(1, -1);
    expect(serviceBlocks).toHaveLength(2);
    if (serviceBlocks[0].type !== "section") throw new Error("unexpected block type");
    expect(serviceBlocks[0].text.text).toContain("Amazon EC2");
    expect(serviceBlocks[0].text.text).toContain("$10.50");
    if (serviceBlocks[1].type !== "section") throw new Error("unexpected block type");
    expect(serviceBlocks[1].text.text).toContain("Amazon S3");

    const contextBlock = result.blocks[result.blocks.length - 1];
    expect(contextBlock.type).toBe("context");
    expect("elements" in contextBlock).toBe(true);
    const elements = (contextBlock as unknown as { elements: { text: string }[] }).elements;
    expect(elements).toHaveLength(1);
    expect(elements[0].text).toContain("$15.75");
    expect(elements[0].text).toContain("JPY");
  });

  test("formats positive/negative changes with appropriate indicators", () => {
    const result = formatSlackMessage(sampleData);

    const ec2Block = result.blocks[1];
    if (ec2Block.type !== "section") throw new Error("unexpected block type");
    expect(ec2Block.text.text).toContain("+25.0%");
    expect(ec2Block.text.text).toContain("-10.0%");

    const s3Block = result.blocks[2];
    if (s3Block.type !== "section") throw new Error("unexpected block type");
    expect(s3Block.text.text).toContain("N/A");
    expect(s3Block.text.text).toContain("+50.0%");
  });
});
