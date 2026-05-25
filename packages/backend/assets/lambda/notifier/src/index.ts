import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";

import { getAllCostData } from "./cost-explorer-client.js";
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

    const [webhookUrl, [costData, jpyRate]] = await Promise.all([
      getSlackWebhookUrl(ssmParameterPath),
      Promise.all([getAllCostData(topN), getUsdJpyRate()]),
    ]);

    await postToSlack(webhookUrl, {
      date: costData.date,
      services: costData.services.map((s) => ({
        name: s.serviceName,
        amount: s.amount,
        dayOverDayChange: s.dayOverDayChange,
        weekOverWeekChange: s.weekOverWeekChange,
      })),
      topN,
      totalAmount: costData.totalAmount,
      monthToDateAmount: costData.monthToDateAmount,
      currency: costData.currency,
      jpyRate,
      weeklyHistory: costData.weeklyHistory,
      weeklyServiceHistory: costData.weeklyServiceHistory.map((d) => ({
        date: d.date,
        services: Object.fromEntries(d.services),
        total: d.total,
      })),
    });

    console.log("Successfully posted daily cost report to Slack");
  }
  catch (error) {
    console.error("Failed to process daily cost report:", error);
    throw error;
  }
};
