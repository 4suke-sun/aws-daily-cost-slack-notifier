import { describe, expect, test } from "vitest";

import { handler } from "./index.js";

describe("handler", () => {
  test("正常に実行される", async () => {
    const event = {
      version: "0",
      id: "test-id",
      "detail-type": "Scheduled Event",
      source: "aws.scheduler",
      account: "123456789012",
      time: "2024-01-01T00:00:00Z",
      region: "ap-northeast-1",
      resources: [],
      detail: {},
    };
    await expect(handler(event)).resolves.toBeUndefined();
  });
});
