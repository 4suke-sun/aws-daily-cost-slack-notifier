export interface SlackCostData {
  date: string;
  services: {
    name: string;
    amount: number;
    dayOverDayChange: number | null;
    weekOverWeekChange: number | null;
  }[];
  totalAmount: number;
  currency: string;
  jpyRate: number;
}

function formatChange(change: number | null): string {
  if (change === null) {
    return "N/A";
  }
  const sign = change >= 0 ? "+" : "";
  const emoji = change > 0 ? "\u{1F53A}" : change < 0 ? "\u{1F53B}" : "\u27A1\uFE0F";
  return `${emoji} ${sign}${change.toFixed(1)}%`;
}

export function formatSlackMessage(data: SlackCostData) {
  const blocks = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `AWS Daily Cost Report - ${data.date}`,
        emoji: true,
      },
    },
  ];

  for (const service of data.services) {
    const dayChange = formatChange(service.dayOverDayChange);
    const weekChange = formatChange(service.weekOverWeekChange);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${service.name}*\n$${service.amount.toFixed(2)} ${data.currency}`
          + ` | DoD: ${dayChange} | WoW: ${weekChange}`,
      },
    });
  }

  const jpyTotal = (data.totalAmount * data.jpyRate).toFixed(0);
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `Total: $${data.totalAmount.toFixed(2)} ${data.currency}`
        + ` (\u00A5${jpyTotal} JPY @ ${data.jpyRate.toFixed(2)})`,
    }],
  });

  return { blocks };
}

const SLACK_TIMEOUT_MS = 10_000;

export async function postToSlack(webhookUrl: string, data: SlackCostData): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);

  try {
    const payload = formatSlackMessage(data);
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Slack webhook returned status ${response.status}`);
    }
  }
  finally {
    clearTimeout(timeout);
  }
}
