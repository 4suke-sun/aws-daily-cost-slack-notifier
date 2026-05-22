import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { FALLBACK_RATE, getUsdJpyRate } from "./exchange-rate-client.js";

describe("getUsdJpyRate", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("returns JPY rate from primary URL on success", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ usd: { jpy: 149.5 } }), { status: 200 }),
    );

    const rate = await getUsdJpyRate();

    expect(rate).toBe(149.5);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test("falls back to backup URL when primary fails", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ usd: { jpy: 152.0 } }), { status: 200 }),
      );

    const rate = await getUsdJpyRate();

    expect(rate).toBe(152.0);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  test("returns fallback rate when both URLs fail", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("Network error"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- suppress console output in tests
      () => {},
    );

    const rate = await getUsdJpyRate();

    expect(rate).toBe(FALLBACK_RATE);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("returns fallback rate on invalid JSON", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("not json", { status: 200, headers: { "Content-Type": "text/plain" } }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- suppress console output in tests
      () => {},
    );

    const rate = await getUsdJpyRate();

    expect(rate).toBe(FALLBACK_RATE);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("returns fallback rate on HTTP error response", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("Too Many Requests", { status: 429 }),
    );
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- suppress console output in tests
      () => {},
    );

    const rate = await getUsdJpyRate();

    expect(rate).toBe(FALLBACK_RATE);
    expect(warnSpy).toHaveBeenCalled();
  });

  test("returns fallback rate on timeout", async () => {
    vi.mocked(fetch).mockRejectedValue(new DOMException("Aborted", "AbortError"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- suppress console output in tests
      () => {},
    );

    const rate = await getUsdJpyRate();

    expect(rate).toBe(FALLBACK_RATE);
    expect(warnSpy).toHaveBeenCalled();
  });
});
