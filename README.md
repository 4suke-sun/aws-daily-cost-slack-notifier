# aws-daily-cost-slack-notifier

AWS の前日のコスト利用額を、毎朝 Slack に自動通知するサーバーレスアプリです。
Cost Explorer API から取得したコスト情報をサービス別に集計し、前日比・前週同曜日比とともに Slack に投稿します。

## 特徴

- 前日のコスト（サービス別 Top N + Others）を毎朝 JST 9:00 に Slack 通知
- 前日比（DoD）・前週同曜日比（WoW）を自動計算
- 外部 API から取得した USD/JPY レートで円換算を併記（取得失敗時は固定レートにフォールバック）
- Slack Webhook URL は SSM Parameter Store（SecureString）で管理
- Lambda 失敗時は SQS デッドレターキューに記録
- AWS CDK で一発デプロイ / 撤去、デプロイ時に `-c` でパラメータ上書き可能
- Vitest によるユニットテスト同梱（20 テスト）

## 通知イメージ

```
AWS Daily Cost Report - 2026-05-16
────────────────────────────────────
*Amazon EC2*
$12.34 USD | DoD: 🔺 +5.2% | WoW: 🔻 -3.1%

*Amazon S3*
$3.45 USD | DoD: ➡️ +0.0% | WoW: 🔺 +10.5%

*Others*
$1.20 USD | DoD: N/A | WoW: N/A
────────────────────────────────────
Total: $16.99 USD (¥2549 JPY @ 150.00)
```

## アーキテクチャ

```
EventBridge Rule (UTC 0:00)
        │
        ▼
    Lambda (Node.js 22)
        ├──▶ Cost Explorer API       (前日・前々日・前週同曜日のコスト取得)
        ├──▶ 外部為替 API            (USD/JPY レート取得、失敗時はフォールバック)
        ├──▶ SSM Parameter Store     (Slack Webhook URL の取得)
        └──▶ Slack Incoming Webhook
失敗時 └──▶ SQS デッドレターキュー
```

### AWS リソース一覧

| リソース | 設定 |
|---------|------|
| Lambda | Node.js 22、256 MB、タイムアウト 30 秒 |
| EventBridge Rule | 毎日 UTC 0:00（JST 9:00）、`-c scheduleUtcHour` で変更可 |
| SSM Parameter Store | `/daily-cost-notifier/slack-webhook-url`（SecureString）、`-c ssmParameterPath` で変更可 |
| SQS DLQ | 保持期間 14 日、SQS マネージド暗号化 |
| CloudWatch Logs | 保持期間 2 週間 |

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
| Node.js | 22 |
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

## デプロイ手順

```bash
# 差分確認
npm run cdk:diff

# デフォルト設定でデプロイ
npm run cdk:deploy

# パラメータを上書きしてデプロイ
npm run cdk:deploy -- -c topN=10 -c scheduleUtcHour=1 -c ssmParameterPath=/prod/slack-webhook

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
