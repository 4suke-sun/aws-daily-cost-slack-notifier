# aws-daily-cost-slack-notifier

AWS の前日のコスト利用額を、毎朝 Slack に自動通知するサーバーレスアプリです。
Cost Explorer API から取得したコスト情報をサービス別に集計し、前日比・前週同曜日比とともに Slack に投稿します。

## 特徴

- 前日のコスト（サービス別 Top N + Others）を毎朝 JST 9:00 に Slack 通知
- 前日比・前週同曜日比を日本語表記で自動計算
- 月累計（MTD）コストを表示
- 過去7日間のサービス別コスト推移を**積み上げ棒グラフ**で可視化（QuickChart.io）
- Credit / Refund を除外した実稼働コストを表示
- 外部 API から取得した USD/JPY レートで円換算を併記（取得失敗時は 150 円固定にフォールバック）
- Slack Webhook URL は SSM Parameter Store（SecureString）で管理
- **Cost Explorer API 呼び出しを最小化**（通常1回/日、月初の前週比オプション有効時のみ2回/日）
- シンプル構成（小規模運用向けに DLQ なし）
- AWS CDK で一発デプロイ / 撤去、デプロイ時に `-c` でパラメータ上書き可能
- Vitest によるユニットテスト同梱

## 通知イメージ

```
📊 AWSコスト日報 - 2026-05-17

[過去7日間のサービス別コスト推移（積み上げ棒グラフ画像）]

────────────────────────────────────
📋 サービス別内訳

*Savings Plans for AWS Compute usage*
💰 $0.55 USD　📅 前日比: ➡️ +0.0%　📆 前週比: ➡️ +0.0%

*AWS Cost Explorer*
💰 $0.50 USD　📅 前日比: 🔺 +900.0%　📆 前週比: 🔺 +900.0%

*Claude Haiku 4.5 (Amazon Bedrock Edition)*
💰 $0.21 USD　📅 前日比: 🔺 +100.0%　📆 前週比: 🔺 +100.0%

*EC2 - Other*
💰 $0.06 USD　📅 前日比: ➡️ +0.0%　📆 前週比: ➡️ +0.0%

*Others*
💰 $0.03 USD　📅 前日比: 🔻 -40.0%　📆 前週比: 🔻 -35.2%

────────────────────────────────────
💴 前日合計: $1.35 USD (¥214 JPY)
📅 月累計: $14.89 USD (¥2,361 JPY)
ℹ️ レート: 158.61 | Credit/Refund 除外（実稼働コスト）
```

## アーキテクチャ

```
EventBridge Rule (UTC 0:00)
        │
        ▼
    Lambda (Node.js 24)
        ├──▶ Cost Explorer API       (月初〜前日の日次コストを1回で取得)
        ├──▶ 外部為替 API            (USD/JPY レート取得、失敗時は150円フォールバック)
        ├──▶ QuickChart.io           (サービス別積み上げ棒グラフ画像の生成)
        ├──▶ SSM Parameter Store     (Slack Webhook URL の取得)
        └──▶ Slack Incoming Webhook
```

### Cost Explorer API 呼び出し戦略

1回の API コールで `min(月初, 7日前)` 〜 今日 の日次データ（`GroupBy: SERVICE`）を取得し、以下をすべて算出します：

- 前日のサービス別コスト
- 前日比（一昨日との比較）
- 前週同曜日比（月の8日以降は同一クエリ内のデータを使用）
- 過去7日間のサービス別推移グラフ用データ
- 月累計（MTD）

| シナリオ | API 呼び出し回数 | 月間コスト目安 |
|---------|:---:|:---:|
| 通常（月の8日以降） | 1回/日 | 約 $0.30/月 |
| 月初（`enableWeekOverWeek: false`） | 1回/日 | 約 $0.30/月 |
| 月初（`enableWeekOverWeek: true`） | 2回/日 | 約 $0.37/月 |

> 月初1〜7日は前週同曜日が前月に跨るため、デフォルトでは前週比を「ー」表示にします。
> `enableWeekOverWeek: true` にすると、その期間のみ追加1回の API コールで前月データを取得します。

### AWS リソース一覧

| リソース | 設定 |
|---------|------|
| Lambda | Node.js 24、256 MB、タイムアウト 30 秒 |
| EventBridge Rule | 毎日 UTC 0:00（JST 9:00）、`-c scheduleUtcHour` で変更可 |
| SSM Parameter Store | `/daily-cost-notifier/slack-webhook-url`（SecureString）、`-c ssmParameterPath` で変更可 |
| CloudWatch Logs | 保持期間 無期限 |

## プロジェクト構成

```
packages/backend/
├── bin/backend.ts                        # CDK アプリエントリポイント
├── cdk.json                              # CDK 設定・context デフォルト値
├── lib/
│   └── aws-daily-cost-slack-notifier-stack.ts  # CDK スタック定義
├── assets/lambda/notifier/
│   └── src/
│       ├── index.ts                      # Lambda ハンドラー
│       ├── cost-explorer-client.ts       # Cost Explorer API クライアント（1回で全データ取得）
│       ├── exchange-rate-client.ts       # 為替レート取得クライアント
│       └── slack-client.ts              # Slack 通知クライアント（積み上げグラフ生成）
└── test/
    └── aws-daily-cost-slack-notifier.test.ts   # CDK スナップショットテスト
```

## 開発環境

| ツール | バージョン |
|-------|----------|
| Node.js | 24 |
| TypeScript | ^5.8 |
| AWS CDK | v2 |
| Vitest | ^3.2 |
| ESLint | ^9.23（Flat Config） |

## セットアップ

```bash
# 依存関係インストール
npm install

# CDK ブートストラップ（初回のみ）
npx cdk bootstrap

# Slack Webhook URL を SSM Parameter Store に登録（初回のみ）
aws ssm put-parameter \
  --name /daily-cost-notifier/slack-webhook-url \
  --type SecureString \
  --value "https://hooks.slack.com/services/XXX/YYY/ZZZ"
```

## デプロイパラメータ

`cdk.json` にデフォルト値が定義されており、`-c key=value` で上書きできます。

| パラメータ | 説明 | デフォルト |
|-----------|------|----------|
| `ssmParameterPath` | Slack Webhook URL の SSM パス | `/daily-cost-notifier/slack-webhook-url` |
| `topN` | 通知するサービスの上位件数 | `5` |
| `scheduleUtcHour` | 実行時刻（UTC 時、JST = UTC + 9） | `0`（= JST 9:00） |
| `enableWeekOverWeek` | 月初1-7日も前週比を取得するか（追加 API コール発生） | `false` |

## デプロイ手順

```bash
# 差分確認
npm run cdk:diff

# デフォルト設定でデプロイ
npm run cdk:deploy

# パラメータを上書きしてデプロイ（プロファイル指定あり）
npm run cdk:deploy -- -c topN=10 -c scheduleUtcHour=1 -c ssmParameterPath=/prod/slack-webhook --profile your-profile

# 前週比を月初1〜7日も出したい場合
npm run cdk:deploy -- -c enableWeekOverWeek=true

# スタックの削除
npm run cdk:destroy
```

## テスト実行

```bash
# 全テスト（CDK + Lambda）
npm run test

# CDK スナップショットテストのみ
npm run cdk:test

# Lambda ユニットテストのみ
npm run assets:test
```

## リント

```bash
npm run lint
```

## ライセンス

MIT
