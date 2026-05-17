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

function buildCostResponse(services: Record<string, string>): GetCostAndUsageResponse {
  return {
    ResultsByTime: [{
      TimePeriod: { Start: "2024-01-14", End: "2024-01-15" },
      Groups: Object.entries(services).map(([name, amount]) => ({
        Keys: [name],
        Metrics: {
          UnblendedCost: { Amount: amount, Unit: "USD" },
        },
      })),
    }],
  };
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
    vi.stubEnv("SSM_PARAMETER_PATH", "/test/slack-webhook");
    vi.stubEnv("TOP_N", "3");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("happy path: SSM からシークレットを取得してSlack通知を送信する", async () => {
    ssmMock.on(GetParameterCommand).resolves({
      Parameter: { Value: "https://hooks.slack.com/services/test" },
    });
    ceMock.on(GetCostAndUsageCommand).resolves(buildCostResponse({
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
    ceMock.on(GetCostAndUsageCommand).resolves(buildCostResponse({}));
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
    ceMock.on(GetCostAndUsageCommand).resolves(buildCostResponse({ "Amazon EC2": "10.00" }));

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("exchangerate")) {
        return Promise.resolve(new Response(JSON.stringify({ rates: { JPY: 150.0 } }), { status: 200 }));
      }
      return Promise.resolve(new Response("error", { status: 500 }));
    }));

    await expect(handler(fakeEvent, fakeContext, noop)).rejects.toThrow("Slack webhook returned status 500");
  });
});
