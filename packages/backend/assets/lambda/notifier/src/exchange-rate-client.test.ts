import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getExchangeRate, getFallbackRate } from "./exchange-rate-client.js";

describe("exchange-rate-client", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("getExchangeRate", () => {
    test("正常系: USD/JPY レートを取得できる", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rates: { JPY: 155.23 } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const rate = await getExchangeRate();

      expect(rate).toBe(155.23);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.exchangerate-api.com/v4/latest/USD",
        expect.objectContaining({ signal: expect.any(AbortSignal) as AbortSignal }),
      );
    });

    test("HTTP エラー時にフォールバック値を返す", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });
      vi.stubGlobal("fetch", mockFetch);

      const rate = await getExchangeRate();

      expect(rate).toBe(150.0);
    });

    test("レスポンスに JPY が含まれない場合フォールバック値を返す", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rates: { EUR: 0.92 } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const rate = await getExchangeRate();

      expect(rate).toBe(150.0);
    });

    test("レートが NaN の場合フォールバック値を返す", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ rates: { JPY: NaN } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const rate = await getExchangeRate();

      expect(rate).toBe(150.0);
    });

    test("ネットワークエラー時にフォールバック値を返す", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const rate = await getExchangeRate();

      expect(rate).toBe(150.0);
    });

    test("タイムアウト時にフォールバック値を返す", async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        new DOMException("The operation was aborted.", "AbortError"),
      );
      vi.stubGlobal("fetch", mockFetch);

      const rate = await getExchangeRate();

      expect(rate).toBe(150.0);
    });
  });

  describe("getFallbackRate", () => {
    test("フォールバックレートを返す", () => {
      expect(getFallbackRate()).toBe(150.0);
    });
  });
});
