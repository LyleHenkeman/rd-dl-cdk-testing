#!/usr/bin/env node

// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import { BlogGlueWorkFlowStack } from '../lib/blog-glue-workflow-stack';

const app = new cdk.App();

const workflow_stack = new BlogGlueWorkFlowStack(app, 'workflow-stack', {
  stackName: 'workflow-stack',
  description: 'creates the Glue workflow, Crawlers, Jobs and triggers'
});
