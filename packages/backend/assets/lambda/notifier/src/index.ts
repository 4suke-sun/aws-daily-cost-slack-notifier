import { GetSecretValueCommand, SecretsManagerClient } from "@aws-sdk/client-secrets-manager";

import { getCostData } from "./cost-explorer-client.js";
import { getExchangeRate } from "./exchange-rate-client.js";
import { sendSlackNotification } from "./slack-client.js";

import type { ScheduledEvent } from "aws-lambda";

const SECRET_ID = process.env.SLACK_WEBHOOK_SECRET_ID ?? "/daily-cost-notifier/slack-webhook-url";
const secretsClient = new SecretsManagerClient({});

async function getSlackWebhookUrl(): Promise<string> {
  const command = new GetSecretValueCommand({ SecretId: SECRET_ID });
  const response = await secretsClient.send(command);

  if (!response.SecretString) {
    throw new Error("Slack webhook URL secret is empty");
  }

  return response.SecretString;
}

export const handler = async (_event: ScheduledEvent): Promise<void> => {
  console.log("Starting daily cost notification...");

  const webhookUrl = await getSlackWebhookUrl();
  const [costData, exchangeRate] = await Promise.all([
    getCostData(),
    getExchangeRate(),
  ]);

  console.log(`Cost data retrieved. Total: $${costData.yesterdayTotal.toFixed(2)}`);
  console.log(`Exchange rate: 1 USD = ${exchangeRate.toFixed(2)} JPY`);

  await sendSlackNotification(webhookUrl, { costData, exchangeRate });

  console.log("Daily cost notification sent successfully.");
};
