import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import { getDailyCosts, getMonthToDateCost, getWeeklyCostHistory } from "./cost-explorer-client.js";
import { getUsdJpyRate } from "./exchange-rate-client.js";
import { postToSlack } from "./slack-client.js";

import type { ScheduledHandler } from "aws-lambda";

const ssmClient = new SSMClient({});

async function getSlackWebhookUrl(parameterPath: string): Promise<string> {
  const response = await ssmClient.send(new GetParameterCommand({
    Name: parameterPath,
    WithDecryption: true,
  }));
  const value = response.Parameter?.Value;
  if (!value) {
    throw new Error("Slack webhook URL parameter is empty");
  }
  return value;
}

export const handler: ScheduledHandler = async () => {
  try {
    const ssmParameterPath = process.env.SSM_PARAMETER_PATH;
    if (!ssmParameterPath) {
      throw new Error("SSM_PARAMETER_PATH environment variable is not set");
    }
    const parsedTopN = parseInt(process.env.TOP_N ?? "5", 10);
    const topN = Number.isNaN(parsedTopN) || parsedTopN <= 0 ? 5 : parsedTopN;

    const [webhookUrl, [costResult, jpyRate, weeklyHistory, monthToDateAmount]] = await Promise.all([
      getSlackWebhookUrl(ssmParameterPath),
      Promise.all([getDailyCosts(topN), getUsdJpyRate(), getWeeklyCostHistory(), getMonthToDateCost()]),
    ]);

    await postToSlack(webhookUrl, {
      date: costResult.date,
      services: costResult.services.map((s) => ({
        name: s.serviceName,
        amount: s.amount,
        dayOverDayChange: s.dayOverDayChange,
        weekOverWeekChange: s.weekOverWeekChange,
      })),
      totalAmount: costResult.totalAmount,
      monthToDateAmount,
      currency: costResult.currency,
      jpyRate,
      weeklyHistory,
    });

    console.log("Successfully posted daily cost report to Slack");
  }
  catch (error) {
    console.error("Failed to process daily cost report:", error);
    throw error;
  }
};
