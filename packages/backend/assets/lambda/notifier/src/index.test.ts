import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { handler } from "./index.js";

import type { GetCostAndUsageResponse } from "@aws-sdk/client-cost-explorer";
import type { Callback, Context } from "aws-lambda";

const ssmMock = mockClient(SSMClient);
const ceMock = mockClient(CostExplorerClient);

const noop: Callback = () => { return; };
const fakeContext = {} as Context;
const fakeEvent = {} as never;

/**
 * Build a multi-day MTD response. Today is set to Jan 15, so we need data from Jan 1-14.
 */
function buildMultiDayCostResponse(services: Record<string, string>): GetCostAndUsageResponse {
  const days = [];
  for (let d = 1; d <= 14; d++) {
    const dateStr = `2024-01-${String(d).padStart(2, "0")}`;
    const nextDay = d + 1;
    const endStr = `2024-01-${String(nextDay).padStart(2, "0")}`;
    days.push({
      TimePeriod: { Start: dateStr, End: endStr },
      Groups: Object.entries(services).map(([name, amount]) => ({
        Keys: [name],
        Metrics: {
          UnblendedCost: { Amount: amount, Unit: "USD" },
        },
      })),
    });
  }
  return { ResultsByTime: days };
}

function mockFetchSuccess() {
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
    if (url.includes("exchangerate")) {
      return Promise.resolve(new Response(
        JSON.stringify({ rates: { JPY: 150.0 } }),
        { status: 200 },
      ));
    }
    return Promise.resolve(new Response("ok", { status: 200 }));
  }));
}

describe("handler", () => {
  beforeEach(() => {
    ssmMock.reset();
    ceMock.reset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00Z"));
    vi.stubEnv("SSM_PARAMETER_PATH", "/test/slack-webhook");
    vi.stubEnv("TOP_N", "3");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("happy path: SSM からシークレットを取得してSlack通知を送信する", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: "https://hooks.slack.com/services/test" },
    });
    ceMock.on(GetCostAndUsageCommand).resolves(buildMultiDayCostResponse({
      "Amazon EC2": "10.00",
      "Amazon S3": "5.00",
      "AWS Lambda": "3.00",
    }));
    mockFetchSuccess();

    await expect(handler(fakeEvent, fakeContext, noop)).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  test("SSM_PARAMETER_PATH が未設定の場合エラーが伝搬する", async () => {
    vi.unstubAllEnvs();

    await expect(handler(fakeEvent, fakeContext, noop)).rejects.toThrow(
      "SSM_PARAMETER_PATH environment variable is not set",
    );
  });

  test("SSM 取得失敗時にエラーが伝搬する", async () => {
    ssmMock.on(GetParameterCommand).rejects(new Error("ParameterNotFound"));
    mockFetchSuccess();

    await expect(handler(fakeEvent, fakeContext, noop)).rejects.toThrow("ParameterNotFound");
  });

  test("SSM の Parameter.Value が空の場合エラーが伝搬する", async () => {
    ssmMock.on(GetParameterCommand).resolves({ Parameter: { Value: undefined } });
    ceMock.on(GetCostAndUsageCommand).resolves(buildMultiDayCostResponse({}));
    mockFetchSuccess();

    await expect(handler(fakeEvent, fakeContext, noop)).rejects.toThrow(
      "Slack webhook URL parameter is empty",
    );
  });

  test("Cost Explorer 失敗時にエラーが伝搬する", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: "https://hooks.slack.com/services/test" },
    });
    ceMock.on(GetCostAndUsageCommand).rejects(new Error("Cost Explorer error"));
    mockFetchSuccess();

    await expect(handler(fakeEvent, fakeContext, noop)).rejects.toThrow("Cost Explorer error");
  });

  test("Slack 送信失敗時にエラーが伝搬する", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: "https://hooks.slack.com/services/test" },
    });
    ceMock.on(GetCostAndUsageCommand).resolves(buildMultiDayCostResponse({ "Amazon EC2": "10.00" }));

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("exchangerate")) {
        return Promise.resolve(new Response(JSON.stringify({ rates: { JPY: 150.0 } }), { status: 200 }));
      }
      return Promise.resolve(new Response("error", { status: 500 }));
    }));

    await expect(handler(fakeEvent, fakeContext, noop)).rejects.toThrow("Slack webhook returned status 500");
  });
});
