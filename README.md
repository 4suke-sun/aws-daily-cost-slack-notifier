# aws-daily-cost-slack-notifier

## 概要

DESCRIPTION

仕様・設計・手順などのドキュメントは `${repository-root}/docs/aws-daily-cost-slack-notifier` を参照してください。

## 開発環境

本プロジェクトの開発環境は Visual Studio Code を推奨します。
パッケージマネージャは `npm` を使用し、ワークスペース機能で `node_modules` を管理します。

| ツール | バージョン |
|-------|----------|
| Node.js | 22 |
| TypeScript | ^5.8 |
| AWS CDK | v2 |

## デプロイ手順

### AWS バックエンド

```bash
# 依存関係インストール
npm install -ws

# スタックのデプロイ
npm run cdk:deploy -- -c paramKey=paramValue
```

## テスト実行

```bash
# 全テスト
npm run test

# CDKテストのみ
npm run cdk:test

# Lambdaテストのみ
npm run assets:test
```

## リント

```bash
npm run lint
```
