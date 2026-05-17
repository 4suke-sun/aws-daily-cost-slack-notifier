import { describe, expect, it } from "vitest";

import { handler } from "./index.js";

describe("handler", () => {
  it("should return statusCode 200", async () => {
    const result = await handler(
      {} as unknown,
      {} as unknown,
      undefined as unknown,
    ) as Record<string, unknown>;
    expect(result).toEqual({ statusCode: 200, body: "ok" });
  });
});
