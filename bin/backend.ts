#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { CdkApiGatewayStack } from "../lib/cdk-api-gateway-stack";
import * as dotenv from "dotenv";
import { CognitoStack } from "../lib/cognito-stack";
import { DBStack } from "../lib/db-stack";
import { MonitoringStack } from "../lib/cloudwatch-stack";

dotenv.config();

const app = new cdk.App();

const env: cdk.Environment = {
  account: process.env.AWS_ACCOUNT,
  region: process.env.AWS_REGION,
};

const cognito = new CognitoStack(app, "CognitoStack", {
  env,
});

const db = new DBStack(app, "DBStack", {
  env,
});

const cdkApiGatewayStack = new CdkApiGatewayStack(app, "CdkApiGatewayStack", {
  env,
  userPool: cognito.userPool,
  userPoolClient: cognito.userPoolClient,
  devlinksTable: db.devlinksTable,
});

new MonitoringStack(app, "MonitoringStack", {
  env,
  api: cdkApiGatewayStack.api,
})