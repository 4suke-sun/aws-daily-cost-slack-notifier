import { CostExplorerClient, GetCostAndUsageCommand } from "@aws-sdk/client-cost-explorer";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { handler } from "./index.js";

import type { GetCostAndUsageResponse } from "@aws-sdk/client-cost-explorer";
import type { Callback, Context } from "aws-lambda";

const smMock = mockClient(SecretsManagerClient);
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
    smMock.reset();
    ceMock.reset();
    vi.stubEnv("SECRET_NAME", "test/secret");
    vi.stubEnv("TOP_N", "3");
  });

  afterEach(() => {
    smMock.restore();
    ceMock.restore();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("happy path: retrieves secret, gets costs, posts to Slack", async () => {
    smMock.on(GetSecretValueCommand).resolves({
      SecretString: "https://hooks.slack.com/services/test",
    });

    const costResponse = buildCostResponse({
      "Amazon EC2": "10.00",
      "Amazon S3": "5.00",
      "AWS Lambda": "3.00",
    });
    ceMock.on(GetCostAndUsageCommand).resolves(costResponse);

    mockFetchSuccess();

    await expect(handler(fakeEvent, fakeContext, noop)).resolves.toBeUndefined();

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  test("throws when Secrets Manager fails", async () => {
    smMock.on(GetSecretValueCommand).rejects(new Error("Access denied"));

    mockFetchSuccess();

    await expect(
      handler(fakeEvent, fakeContext, noop),
    ).rejects.toThrow("Access denied");
  });

  test("throws when Cost Explorer fails", async () => {
    smMock.on(GetSecretValueCommand).resolves({
      SecretString: "https://hooks.slack.com/services/test",
    });

    ceMock.on(GetCostAndUsageCommand).rejects(new Error("Cost Explorer error"));

    mockFetchSuccess();

    await expect(
      handler(fakeEvent, fakeContext, noop),
    ).rejects.toThrow("Cost Explorer error");
  });

  test("throws when Slack returns non-2xx", async () => {
    smMock.on(GetSecretValueCommand).resolves({
      SecretString: "https://hooks.slack.com/services/test",
    });

    const costResponse = buildCostResponse({
      "Amazon EC2": "10.00",
    });
    ceMock.on(GetCostAndUsageCommand).resolves(costResponse);

    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => {
      if (url.includes("exchangerate")) {
        return Promise.resolve(new Response(
          JSON.stringify({ rates: { JPY: 150.0 } }),
          { status: 200 },
        ));
      }
      return Promise.resolve(new Response("error", { status: 500 }));
    }));

    await expect(
      handler(fakeEvent, fakeContext, noop),
    ).rejects.toThrow("Slack webhook returned status 500");
  });
});
