import * as path from "path";
import { fileURLToPath } from "url";

import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction, OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from "cdk-nag";

import type { Construct } from "constructs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class AwsDailyCostSlackNotifierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Secrets Manager - Slack Webhook URL の参照
    const slackWebhookSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "SlackWebhookSecret",
      "/daily-cost-notifier/slack-webhook-url",
    );

    // Lambda 関数
    const notifierFunction = new NodejsFunction(this, "NotifierFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: path.join(__dirname, "../assets/lambda/notifier/src/index.ts"),
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        SLACK_WEBHOOK_SECRET_ID: slackWebhookSecret.secretName,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
      bundling: {
        minify: true,
        sourceMap: true,
        target: "node22",
        format: OutputFormat.ESM,
        mainFields: ["module", "main"],
        esbuildArgs: {
          "--conditions": "module",
        },
      },
    });

    // Secrets Manager 読み取り権限
    slackWebhookSecret.grantRead(notifierFunction);

    // Cost Explorer 読み取り権限
    notifierFunction.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["ce:GetCostAndUsage"],
        resources: ["*"],
      }),
    );

    // EventBridge Rule (毎朝 JST 9:00 = UTC 0:00)
    new events.Rule(this, "DailyCostScheduleRule", {
      schedule: events.Schedule.cron({
        minute: "0",
        hour: "0",
        day: "*",
        month: "*",
        year: "*",
      }),
      targets: [new targets.LambdaFunction(notifierFunction)],
    });

    // cdk-nag suppressions
    NagSuppressions.addStackSuppressions(this, [
      {
        id: "AwsSolutions-IAM4",
        reason: "AWSLambdaBasicExecutionRole is required for Lambda to write logs to CloudWatch",
      },
      {
        id: "AwsSolutions-IAM5",
        reason: "Cost Explorer API requires wildcard resource (*) as it does not support resource-level permissions",
      },
    ]);
  }
}
