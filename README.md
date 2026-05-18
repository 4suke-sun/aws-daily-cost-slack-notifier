# aws-daily-cost-slack-notifier

AWS の前日のコスト利用額を、毎朝 Slack に自動通知するサーバーレスアプリです。
Cost Explorer API から取得したコスト情報をサービス別に集計し、前日比・前週同曜日比とともに Slack に投稿します。

## 特徴

- 前日のコスト（サービス別 Top N + Others）を毎朝 JST 9:00 に Slack 通知
- 前日比・前週同曜日比を日本語表記で自動計算
- 月累計（MTD）コストを表示
- 過去7日間のコスト推移を棒グラフで可視化（QuickChart.io）
- Credit / Refund を除外した実稼働コストを表示
- 外部 API から取得した USD/JPY レートで円換算を併記（取得失敗時は固定レートにフォールバック）
- Slack Webhook URL は SSM Parameter Store（SecureString）で管理
- シンプル構成（小規模運用向けに DLQ なし）
- AWS CDK で一発デプロイ / 撤去、デプロイ時に `-c` でパラメータ上書き可能
- Vitest によるユニットテスト同梱

## 通知イメージ

```
📊 AWSコスト日報 - 2026-05-16

[過去7日間のコスト推移グラフ（棒グラフ画像）]

────────────────────────────────────
📋 サービス別内訳

*Savings Plans for AWS Compute usage*
💰 $0.55 USD　📅 前日比: ➡️ +0.0%　📆 前週比: ➡️ +0.0%

*EC2 - Other*
💰 $0.06 USD　📅 前日比: 🔻 -58.3%　📆 前週比: 🔻 -58.3%

*Others*
💰 $0.08 USD　📅 前日比: 🔻 -40.0%　📆 前週比: 🔻 -35.2%

────────────────────────────────────
💴 前日合計: $0.69 USD (¥109 JPY)
📅 月累計: $11.04 USD (¥1,750 JPY)
ℹ️ レート: 158.61 | Credit/Refund 除外（実稼働コスト）
```

## アーキテクチャ

```
EventBridge Rule (UTC 0:00)
        │
        ▼
    Lambda (Node.js 24)
        ├──▶ Cost Explorer API       (月初〜前日の日次コストを1回で取得、月初1-7日の前週比は追加1回)
        ├──▶ 外部為替 API            (USD/JPY レート取得、失敗時はフォールバック)
        ├──▶ QuickChart.io           (コスト推移グラフ画像の生成)
        ├──▶ SSM Parameter Store     (Slack Webhook URL の取得)
        └──▶ Slack Incoming Webhook
```

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
│       ├── cost-explorer-client.ts       # Cost Explorer API クライアント
│       ├── exchange-rate-client.ts       # 為替レート取得クライアント
│       └── slack-client.ts              # Slack 通知クライアント
└── test/
    └── aws-daily-cost-slack-notifier.test.ts   # CDK スナップショットテスト
```

## 開発環境

| ツール | バージョン |
|-------|----------|
| Node.js | 24 |
| TypeScript | ^5.8 |
| AWS CDK | v2 |

## セットアップ

```bash
# 依存関係インストール
npm install -ws

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
| `enableWeekOverWeek` | 前週比を月初1-7日も取得するか | `false` |

## デプロイ手順

```bash
# 差分確認
npm run cdk:diff

# デフォルト設定でデプロイ
npm run cdk:deploy

# パラメータを上書きしてデプロイ
npm run cdk:deploy -- -c topN=10 -c scheduleUtcHour=1 -c ssmParameterPath=/prod/slack-webhook

# 前週比を1〜7日も出したい場合
npm run cdk:deploy -- -c enableWeekOverWeek=true

# スタックの削除
npm run cdk:destroy
```

## テスト実行

```bash
# 全テスト
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
