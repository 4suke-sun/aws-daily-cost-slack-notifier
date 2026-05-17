# aws-daily-cost-slack-notifier

AWS の前日のコスト利用額を、毎朝 Slack に自動通知するサーバーレスアプリです。
Cost Explorer API から取得したコスト情報を整形し、前日比つきで Slack に投稿します。

## 特徴

- 🪙 前日のコスト（サービス別 Top N）を毎朝 Slack に通知
- 📈 前日比・前週同曜日比を自動計算
- 💴 為替レートを使った円換算を併記
- 🔐 Slack Webhook URL は Secrets Manager で管理
- 🏗️ AWS CDK で一発デプロイ / 撤去
- 🧪 Vitest によるユニットテスト同梱

## 通知イメージ

<!-- Slack 通知のスクリーンショットをここに貼る -->
<img src="docs/aws-daily-cost-slack-notifier/images/slack-preview.png" width="600" />

## アーキテクチャ

```
EventBridge (cron) ──▶ Lambda ──▶ Cost Explorer API
                          │
                          └──▶ Slack Incoming Webhook
                                  ▲
                                  └── Secrets Manager
```

詳細な仕様・設計・運用手順は `docs/aws-daily-cost-slack-notifier/` を参照してください。

## 開発環境

本プロジェクトの開発環境は Visual Studio Code を推奨します。
パッケージマネージャは `npm` を使用し、ワークスペース機能で `node_modules` を管理します。

| ツール | バージョン |
|-------|----------|
| Node.js | 22 |
| TypeScript | ^5.8 |
| AWS CDK | v2 |

## セットアップ

```bash
# 依存関係インストール
npm install -ws

# Slack Webhook URL を Secrets Manager に登録（初回のみ）
aws secretsmanager create-secret \
  --name /daily-cost-notifier/slack-webhook-url \
  --secret-string "https://hooks.slack.com/services/XXX/YYY/ZZZ"
```

## デプロイ手順

```bash
# スタックのデプロイ
npm run cdk:deploy -- -c paramKey=paramValue

# 差分確認
npm run cdk:diff

# スタックの削除
npm run cdk:destroy
```

## テスト実行

```bash
# 全テスト
npm run test

# CDK テストのみ
npm run cdk:test

# Lambda テストのみ
npm run assets:test
```

## リント

```bash
npm run lint
```

## ライセンス

MIT
