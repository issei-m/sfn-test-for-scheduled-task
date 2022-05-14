#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { SfnTestForScheduledTaskStack } from '../lib/sfn-test-for-scheduled-task-stack';

const env: cdk.Environment = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION
};

const app = new cdk.App();
const appClusterInstanceSSHAllowedIP = app.node.tryGetContext('ssh_allowed_ip');
const appClusterInstanceSSHKeyName = app.node.tryGetContext('ssh_key_name');

new SfnTestForScheduledTaskStack(app, 'SfnTestForScheduledTaskStack', {
  env,
  appClusterInstanceSSHAllowedIP,
  appClusterInstanceSSHKeyName
});
