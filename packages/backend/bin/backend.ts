#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { Aspects } from "aws-cdk-lib";
import { AwsSolutionsChecks } from "cdk-nag";

import { AwsDailyCostSlackNotifierStack } from "../lib/aws-daily-cost-slack-notifier-stack.js";

const app = new cdk.App();
new AwsDailyCostSlackNotifierStack(app, "AwsDailyCostSlackNotifierStack");
Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
