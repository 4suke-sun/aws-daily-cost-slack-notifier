import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

import { getDailyCosts } from "./cost-explorer-client.js";
import { getUsdJpyRate } from "./exchange-rate-client.js";
import { postToSlack } from "./slack-client.js";

import type { ScheduledHandler } from "aws-lambda";

const secretsClient = new SecretsManagerClient({});

export const handler: ScheduledHandler = async () => {
  try {
    const secretName = process.env.SECRET_NAME;
    if (!secretName) {
      throw new Error("SECRET_NAME environment variable is not set");
    }
    const parsedTopN = parseInt(process.env.TOP_N ?? "5", 10);
    const topN = Number.isNaN(parsedTopN) || parsedTopN <= 0 ? 5 : parsedTopN;

    const secretResponse = await secretsClient.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    const webhookUrl = secretResponse.SecretString;
    if (!webhookUrl) {
      throw new Error("Slack webhook URL secret is empty");
    }

    const [costResult, jpyRate] = await Promise.all([
      getDailyCosts(topN),
      getUsdJpyRate(),
    ]);

    const slackData = {
      date: costResult.date,
      services: costResult.services.map((s) => ({
        name: s.serviceName,
        amount: s.amount,
        dayOverDayChange: s.dayOverDayChange,
        weekOverWeekChange: s.weekOverWeekChange,
      })),
      totalAmount: costResult.totalAmount,
      currency: costResult.currency,
      jpyRate,
    };

    await postToSlack(webhookUrl, slackData);

    console.log("Successfully posted daily cost report to Slack");
  }
  catch (error) {
    console.error("Failed to process daily cost report:", error);
    throw error;
  }
};
