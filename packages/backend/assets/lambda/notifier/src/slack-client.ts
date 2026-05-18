export interface SlackServiceData {
  name: string;
  amount: number;
  dayOverDayChange: number | null;
  weekOverWeekChange: number | null;
}

export interface SlackDailyTotal {
  date: string;
  amount: number;
}

export interface SlackDailyServiceBreakdown {
  date: string;
  services: Record<string, number>;
  total: number;
}

export interface SlackCostData {
  date: string;
  services: SlackServiceData[];
  totalAmount: number;
  monthToDateAmount: number;
  currency: string;
  jpyRate: number;
  weeklyHistory: SlackDailyTotal[];
  weeklyServiceHistory: SlackDailyServiceBreakdown[];
}

interface HeaderBlock {
  type: "header";
  text: { type: "plain_text"; text: string; emoji: boolean };
}

interface SectionBlock {
  type: "section";
  text: { type: "mrkdwn"; text: string };
}

interface ImageBlock {
  type: "image";
  image_url: string;
  alt_text: string;
}

interface DividerBlock {
  type: "divider";
}

interface ContextBlock {
  type: "context";
  elements: { type: "mrkdwn"; text: string }[];
}

type SlackBlock = HeaderBlock | SectionBlock | ImageBlock | DividerBlock | ContextBlock;

function formatChange(change: number | null): string {
  if (change === null) {
    return "ー";
  }
  const sign = change >= 0 ? "+" : "";
  const emoji = change > 0 ? "\u{1F53A}" : change < 0 ? "\u{1F53B}" : "\u27A1\uFE0F";
  return `${emoji} ${sign}${change.toFixed(1)}%`;
}

function formatDateJp(dateStr: string): string {
  const [, month, day] = dateStr.split("-");
  return `${Number.parseInt(month)}/${Number.parseInt(day)}`;
}

// サービス別積み上げ棒グラフ用の色パレット
const CHART_COLORS = [
  "rgba(54, 162, 235, 0.8)",   // 青
  "rgba(255, 99, 132, 0.8)",   // 赤
  "rgba(75, 192, 192, 0.8)",   // 緑
  "rgba(153, 102, 255, 0.8)",  // 紫
  "rgba(255, 159, 64, 0.8)",   // オレンジ
  "rgba(255, 205, 86, 0.8)",   // 黄
  "rgba(0, 0, 128, 0.8)",      // ネイビー
];

function buildStackedChartUrl(
  history: SlackDailyServiceBreakdown[],
  topServices: SlackServiceData[],
): string {
  const labels = history.map((d) => formatDateJp(d.date));

  // topServicesの順序でデータセットを構築（Othersを含む）
  const serviceNames = topServices.map((s) => s.name);

  const datasets = serviceNames.map((name, idx) => {
    const data = history.map((day) => {
      if (name === "Others") {
        // Others = 日の合計 - topサービス(Others以外)の合計
        const topSum = serviceNames
          .filter((n) => n !== "Others")
          .reduce((sum, n) => sum + (day.services[n] ?? 0), 0);
        return Math.round((day.total - topSum) * 100) / 100;
      }
      return Math.round((day.services[name] ?? 0) * 100) / 100;
    });

    return {
      label: name,
      data,
      backgroundColor: CHART_COLORS[idx % CHART_COLORS.length],
    };
  });

  const chartConfig = {
    type: "bar",
    data: { labels, datasets },
    options: {
      plugins: {
        legend: { display: true, position: "top" },
      },
      scales: {
        xAxes: [{ stacked: true }],
        yAxes: [{
          stacked: true,
          ticks: { beginAtZero: true },
          scaleLabel: { display: true, labelString: "USD" },
        }],
      },
    },
  };

  const encoded = encodeURIComponent(JSON.stringify(chartConfig));
  return `https://quickchart.io/chart?c=${encoded}&w=600&h=300&bkg=white`;
}

export function formatSlackMessage(data: SlackCostData) {
  const blocks: SlackBlock[] = [];

  // ヘッダー
  blocks.push({
    type: "header",
    text: {
      type: "plain_text",
      text: `\u{1F4CA} AWSコスト日報 - ${data.date}`,
      emoji: true,
    },
  });

  // サービス別積み上げグラフ（過去7日間）
  if (data.weeklyServiceHistory.length > 0) {
    blocks.push({
      type: "image",
      image_url: buildStackedChartUrl(data.weeklyServiceHistory, data.services),
      alt_text: "過去7日間のサービス別コスト推移グラフ",
    });
  }

  blocks.push({ type: "divider" });

  // サービス別内訳ヘッダー
  blocks.push({
    type: "section",
    text: {
      type: "mrkdwn",
      text: "*\u{1F4CB} サービス別内訳*",
    },
  });

  // サービス別
  for (const service of data.services) {
    const amount = `$${service.amount.toFixed(2)}`;
    const dod = formatChange(service.dayOverDayChange);
    const wow = formatChange(service.weekOverWeekChange);
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${service.name}*\n`
          + `\u{1F4B0} ${amount} ${data.currency}`
          + `\u3000\u{1F4C5} 前日比: ${dod}`
          + `\u3000\u{1F4C6} 前週比: ${wow}`,
      },
    });
  }

  blocks.push({ type: "divider" });

  // 合計
  const jpyTotal = (data.totalAmount * data.jpyRate).toFixed(0);
  const jpyMtd = (data.monthToDateAmount * data.jpyRate).toFixed(0);
  blocks.push({
    type: "context",
    elements: [{
      type: "mrkdwn",
      text: `\u{1F4B4} *前日合計: $${data.totalAmount.toFixed(2)} ${data.currency}`
        + ` (\u00A5${Number(jpyTotal).toLocaleString()} JPY)*`
        + `\n\u{1F4C5} *月累計: $${data.monthToDateAmount.toFixed(2)} ${data.currency}`
        + ` (\u00A5${Number(jpyMtd).toLocaleString()} JPY)*`
        + `\n\u{2139}\uFE0F レート: ${data.jpyRate.toFixed(2)} | Credit/Refund 除外（実稼働コスト）`,
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
