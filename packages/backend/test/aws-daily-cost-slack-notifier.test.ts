import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { beforeAll, describe, expect, test } from "vitest";

import { AwsDailyCostSlackNotifierStack } from "../lib/aws-daily-cost-slack-notifier-stack.js";

describe("AwsDailyCostSlackNotifierStackのデフォルト生成のテスト", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    template = Template.fromStack(new AwsDailyCostSlackNotifierStack(app, "TestStack", {
      ssmParameterPath: "/daily-cost-notifier/slack-webhook-url",
      topN: 5,
      scheduleUtcHour: 0,
      enableWeekOverWeek: false,
    }));
  });

  test("Snapshot Test", () => {
    expect(template.toJSON()).toMatchSnapshot();
  });
});
