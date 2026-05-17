import type { CostData, ServiceCost } from "./cost-explorer-client.js";

export interface SlackMessageOptions {
  costData: CostData;
  exchangeRate: number;
}

interface SlackBlock {
  type: string;
  text?: { type: string; text: string };
  elements?: { type: string; text: string }[];
}

function formatCurrency(amount: number, currency: string): string {
  return `${currency}${amount.toFixed(2)}`;
}

function calculateChangePercent(current: number, previous: number): string {
  if (previous === 0) return "N/A";
  const change = ((current - previous) / previous) * 100;
  const sign = change >= 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function buildServiceLines(services: ServiceCost[], exchangeRate: number): string {
  if (services.length === 0) return "_データなし_";
  return services
    .map((s, i) => {
      const usd = formatCurrency(s.amount, "$");
      const jpy = formatCurrency(s.amount * exchangeRate, "\u00a5");
      return `${i + 1}. *${s.serviceName}*: ${usd} (${jpy})`;
    })
    .join("\n");
}

export function buildSlackBlocks(options: SlackMessageOptions): SlackBlock[] {
  const { costData, exchangeRate } = options;
  const { yesterday, yesterdayTotal, dayBeforeYesterdayTotal, lastWeekSameDayTotal } = costData;

  const totalUsd = formatCurrency(yesterdayTotal, "$");
  const totalJpy = formatCurrency(yesterdayTotal * exchangeRate, "\u00a5");
  const dayOverDay = calculateChangePercent(yesterdayTotal, dayBeforeYesterdayTotal);
  const weekOverWeek = calculateChangePercent(yesterdayTotal, lastWeekSameDayTotal);

  const blocks: SlackBlock[] = [
    {
      type: "header",
      text: { type: "plain_text", text: "AWS Daily Cost Report" },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Total:* ${totalUsd} (${totalJpy})`,
          `*前日比:* ${dayOverDay}`,
          `*前週同曜日比:* ${weekOverWeek}`,
          `*為替レート:* 1 USD = ${exchangeRate.toFixed(2)} JPY`,
        ].join("\n"),
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Service別コスト (Top ${yesterday.length})*\n${buildServiceLines(yesterday, exchangeRate)}`,
      },
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `Reported at ${new Date().toISOString().split("T")[0]}` }],
    },
  ];

  return blocks;
}

export async function sendSlackNotification(webhookUrl: string, options: SlackMessageOptions): Promise<void> {
  const blocks = buildSlackBlocks(options);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Slack webhook failed with status ${response.status}: ${response.statusText}`);
    }
  }
  catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Slack webhook request timed out");
    }
    throw error;
  }
  finally {
    clearTimeout(timeout);
  }
}
