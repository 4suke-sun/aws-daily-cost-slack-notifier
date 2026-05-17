import * as cdk from "aws-cdk-lib";
import { NagSuppressions } from "cdk-nag";

import type { Construct } from "constructs";

export class AwsDailyCostSlackNotifierStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    NagSuppressions.addStackSuppressions(this, [
      // {
      //   id: "AwsSolutions-IAM4",
      //   reason: "...",
      // },
    ]);
  }
}
