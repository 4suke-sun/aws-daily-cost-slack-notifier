#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

import { AwsDailyCostSlackNotifierStack } from "../lib/aws-daily-cost-slack-notifier-stack.js";

const app = new cdk.App();

const ssmParameterPath = String(app.node.tryGetContext("ssmParameterPath") ?? "/daily-cost-notifier/slack-webhook-url");
const topN = Number(app.node.tryGetContext("topN") ?? 5);
const scheduleUtcHour = Number(app.node.tryGetContext("scheduleUtcHour") ?? 0);
const enableWeekOverWeek = app.node.tryGetContext("enableWeekOverWeek") === true || app.node.tryGetContext("enableWeekOverWeek") === "true";

new AwsDailyCostSlackNotifierStack(app, "AwsDailyCostSlackNotifierStack", {
  ssmParameterPath,
  topN,
  scheduleUtcHour,
  enableWeekOverWeek,
});

Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
