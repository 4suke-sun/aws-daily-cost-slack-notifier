import * as path from "path";
import { fileURLToPath } from "url";

import * as cdk from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { NagSuppressions } from "cdk-nag";

import type { Construct } from "constructs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export class AwsDailyCostSlackNotifierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const secret = secretsmanager.Secret.fromSecretNameV2(
      this,
      "SlackWebhookSecret",
      "/daily-cost-notifier/slack-webhook-url",
    );

    const fn = new nodejs.NodejsFunction(this, "NotifierFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(__dirname, "../assets/lambda/notifier/src/index.ts"),
      handler: "handler",
      environment: {
        SECRET_NAME: "/daily-cost-notifier/slack-webhook-url",
        TOP_N: "5",
      },
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      bundling: {
        format: nodejs.OutputFormat.ESM,
        mainFields: ["module", "main"],
        banner: "import { createRequire } from \"module\"; const require = createRequire(import.meta.url);",
        externalModules: ["@aws-sdk/*"],
      },
    });

    secret.grantRead(fn);

    fn.addToRolePolicy(new iam.PolicyStatement({
      actions: ["ce:GetCostAndUsage"],
      resources: ["*"],
    }));

    const rule = new events.Rule(this, "DailySchedule", {
      schedule: events.Schedule.cron({ minute: "0", hour: "0", day: "*", month: "*", year: "*" }),
    });
    rule.addTarget(new targets.LambdaFunction(fn));

    NagSuppressions.addResourceSuppressions(
      fn,
      [
        {
          id: "AwsSolutions-IAM4",
          reason: "Lambda uses AWS managed policy AWSLambdaBasicExecutionRole for CloudWatch logging",
        },
        {
          id: "AwsSolutions-IAM5",
          reason:
            "ce:GetCostAndUsage does not support resource-level permissions; wildcard resource is required. "
            + "Secrets Manager grant also uses wildcard for the key.",
        },
      ],
      true,
    );
  }
}
