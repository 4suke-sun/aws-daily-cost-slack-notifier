import { CostExplorerClient } from "@aws-sdk/client-cost-explorer";
import { SecretsManagerClient } from "@aws-sdk/client-secrets-manager";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { handler } from "./index.js";

const secretsMock = mockClient(SecretsManagerClient);
const ceMock = mockClient(CostExplorerClient);

vi.mock("./exchange-rate-client.js", () => ({
  getExchangeRate: vi.fn().mockResolvedValue(150.0),
}));

describe("handler", () => {
  beforeEach(() => {
    secretsMock.reset();
    ceMock.reset();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function setupMocks() {
    secretsMock.onAnyCommand().resolves({
      SecretString: "https://hooks.slack.com/services/test",
    });

    ceMock.onAnyCommand().resolves({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ["Amazon EC2"],
              Metrics: { UnblendedCost: { Amount: "10.00", Unit: "USD" } },
            },
            {
              Keys: ["Amazon S3"],
              Metrics: { UnblendedCost: { Amount: "5.00", Unit: "USD" } },
            },
          ],
        },
      ],
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);

    return { mockFetch };
  }

  test("正常系: 全モジュールを呼び出してSlack通知を送信する", async () => {
    const { mockFetch } = setupMocks();

    const event = {
      version: "0",
      id: "test-id",
      "detail-type": "Scheduled Event" as const,
      source: "aws.scheduler",
      account: "123456789012",
      time: "2024-01-01T00:00:00Z",
      region: "ap-northeast-1",
      resources: [],
      detail: {},
    };

    await handler(event);

    expect(mockFetch).toHaveBeenCalledWith(
      "https://hooks.slack.com/services/test",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }),
    );
  });

  test("エラー系: Secrets Manager からの取得失敗時にエラーが伝搬する", async () => {
    secretsMock.onAnyCommand().rejects(new Error("Access denied"));

    ceMock.onAnyCommand().resolves({
      ResultsByTime: [{ Groups: [] }],
    });

    const mockFetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", mockFetch);

    const event = {
      version: "0",
      id: "test-id",
      "detail-type": "Scheduled Event" as const,
      source: "aws.scheduler",
      account: "123456789012",
      time: "2024-01-01T00:00:00Z",
      region: "ap-northeast-1",
      resources: [],
      detail: {},
    };

    await expect(handler(event)).rejects.toThrow("Access denied");
  });

  test("エラー系: SecretString が空の場合にエラーが発生する", async () => {
    secretsMock.onAnyCommand().resolves({
      SecretString: undefined,
    });

    ceMock.onAnyCommand().resolves({
      ResultsByTime: [{ Groups: [] }],
    });

    const event = {
      version: "0",
      id: "test-id",
      "detail-type": "Scheduled Event" as const,
      source: "aws.scheduler",
      account: "123456789012",
      time: "2024-01-01T00:00:00Z",
      region: "ap-northeast-1",
      resources: [],
      detail: {},
    };

    await expect(handler(event)).rejects.toThrow("Slack webhook URL secret is empty");
  });

  test("エラー系: Slack送信失敗時にエラーが伝搬する", async () => {
    secretsMock.onAnyCommand().resolves({
      SecretString: "https://hooks.slack.com/services/test",
    });

    ceMock.onAnyCommand().resolves({
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ["Amazon EC2"],
              Metrics: { UnblendedCost: { Amount: "10.00", Unit: "USD" } },
            },
          ],
        },
      ],
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });
    vi.stubGlobal("fetch", mockFetch);

    const event = {
      version: "0",
      id: "test-id",
      "detail-type": "Scheduled Event" as const,
      source: "aws.scheduler",
      account: "123456789012",
      time: "2024-01-01T00:00:00Z",
      region: "ap-northeast-1",
      resources: [],
      detail: {},
    };

    await expect(handler(event)).rejects.toThrow("Slack webhook failed with status 500");
  });
});
