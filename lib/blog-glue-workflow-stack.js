"use strict";
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogGlueWorkFlowStack = void 0;
const cdk = require("@aws-cdk/core");
const glue = require("@aws-cdk/aws-glue");
const aws_s3_assets_1 = require("@aws-cdk/aws-s3-assets");
const aws_iam_1 = require("@aws-cdk/aws-iam");
const path = require("path");
//define meaningful s3 object keys for copied assets and input CSV files
const scriptsPath = "scripts/";
const covidPath = "covid-data/";
const hiringPath = "hiring-data/";
const covidCasesTable = "covid_data";
const covidHiringTable = "hiring_data";
const parquetPath = "/processed-data/";
const covid_src_bucket = "covid19-lake";
const covid_src_key = "rearc-covid-19-world-cases-deaths-testing/csv/covid-19-world-cases-deaths-testing.csv";
const hiring_src_bucket = "greenwichhr-covidjobimpacts";
const hiring_src_key = "overall.csv.part_00000";
const obj_covidCases = "covid_cases.csv";
const obj_covidHiring = "covid_hiring.csv";
const obj_assets = "glue-cdk-asset-etl.py";
const obj_etl = "glue-parquet-etl.py";
const obj_redshiftLoad = "redshift-load-etl.py";
//set AWS managed policy arn and glue service URL
const glue_managed_policy = "arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole";
const glue_ServiceUrl = "glue.amazonaws.com";
class BlogGlueWorkFlowStack extends cdk.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        //###  Add assets to S3 bucket as individual files  #####
        //python scripts run in Glue Workflow
        const f_pyAssetETL = new aws_s3_assets_1.Asset(this, "py-asset-etl", {
            path: path.join(__dirname, "assets/glue-cdk-asset-etl.py"),
        });
        const f_pyParquet = new aws_s3_assets_1.Asset(this, "py-load", {
            path: path.join(__dirname, "assets/glue-parquet-etl.py"),
        });
        const f_pyRedshiftLoad = new aws_s3_assets_1.Asset(this, "redshift-load", {
            path: path.join(__dirname, "assets/redshift-load-etl.py"),
        });
        //Get dynamic CDK asset bucket name to pass into Glue Jobs
        const assetBucketName = f_pyAssetETL.s3BucketName;
        //create glue database
        const glue_db = new glue.Database(this, "glue-workflow-db", {
            databaseName: "glue-workflow-db",
        });
        //create glue cralwer role to access S3 bucket
        const glue_crawler_role = new aws_iam_1.Role(this, "glue-crawler-role", {
            roleName: "AWSGlueServiceRole-AccessS3Bucket",
            description: "Assigns the managed policy AWSGlueServiceRole to AWS Glue Crawler so it can crawl S3 buckets",
            managedPolicies: [
                aws_iam_1.ManagedPolicy.fromManagedPolicyArn(this, "glue-service-policy", glue_managed_policy),
            ],
            assumedBy: new aws_iam_1.ServicePrincipal(glue_ServiceUrl),
        });
        this.glueRole = glue_crawler_role;
        //add policy to role to grant access to S3 asset bucket and public buckets
        const iam_policy_forAssets = new aws_iam_1.Policy(this, "iam-policy-forAssets", {
            force: true,
            policyName: "glue-policy-workflowAssetAccess",
            roles: [glue_crawler_role],
            statements: [
                new aws_iam_1.PolicyStatement({
                    effect: aws_iam_1.Effect.ALLOW,
                    actions: [
                        "s3:GetObject",
                        "s3:PutObject",
                        "s3:DeleteObject",
                        "s3:ListBucket",
                    ],
                    resources: ["arn:aws:s3:::" + f_pyAssetETL.s3BucketName + "/*"],
                }),
                new aws_iam_1.PolicyStatement({
                    effect: aws_iam_1.Effect.ALLOW,
                    actions: ["s3:GetObject"],
                    resources: [
                        "arn:aws:s3:::" + covid_src_bucket + "/*",
                        "arn:aws:s3:::" + hiring_src_bucket + "/*",
                    ],
                }),
            ],
        });
        //Define paths for scripts and data
        const scripts = "s3://" + assetBucketName + "/" + scriptsPath;
        const covid = "s3://" + assetBucketName + "/" + covidPath;
        const hiring = "s3://" + assetBucketName + "/" + hiringPath;
        const redshift_temp_dir = "s3://" + assetBucketName + "/output/temp/";
        const outputPath = "s3://" + assetBucketName + parquetPath;
        //create glue crawler to crawl csv files in S3
        const glue_crawler_s3 = new glue.CfnCrawler(this, "glue-crawler-s3", {
            name: "s3-csv-crawler",
            role: glue_crawler_role.roleName,
            targets: {
                s3Targets: [
                    {
                        path: covid
                    },
                    {
                        path: hiring
                    },
                ],
            },
            databaseName: glue_db.databaseName,
            schemaChangePolicy: {
                updateBehavior: "UPDATE_IN_DATABASE",
                deleteBehavior: "DEPRECATE_IN_DATABASE",
            },
        });
        //create glue crawler to crawl parqet files in S3
        const glue_crawler_s3_parquet = new glue.CfnCrawler(this, "glue-crawler-s3-parquet", {
            name: "s3-parquet-crawler",
            role: glue_crawler_role.roleName,
            targets: {
                s3Targets: [
                    {
                        path: outputPath,
                    },
                ],
            },
            databaseName: glue_db.databaseName,
            schemaChangePolicy: {
                updateBehavior: "UPDATE_IN_DATABASE",
                deleteBehavior: "DEPRECATE_IN_DATABASE",
            },
        });
        //####  Create the glue workflow, jobs and triggers that will handle the ETL to convert CSV to Parquet and load the parquet file into Redshift #####
        //create glue workflow
        const glue_workflow = new glue.CfnWorkflow(this, "rd-dl-pa-jobmart-raw-workflow", {
            name: "glue-workflow",
            description: "ETL workflow to convert CSV to parquet and then load into Redshift",
        });
        //create jobs
        const glue_job_asset = new glue.CfnJob(this, "glue-job-asset", {
            name: "glue-workflow-assetjob",
            description: "Copy CDK assets to scripts folder and give meaningful name",
            role: glue_crawler_role.roleArn,
            executionProperty: {
                maxConcurrentRuns: 1,
            },
            command: {
                name: "glueetl",
                pythonVersion: "3",
                scriptLocation: f_pyAssetETL.s3ObjectUrl,
            },
            defaultArguments: {
                "--TempDir": "s3://" + f_pyAssetETL.s3BucketName + "/output/temp/",
                "--job-bookmark-option": "job-bookmark-disable",
                "--job-language": "python",
                "--spark-event-logs-path": "s3://" + f_pyAssetETL.s3BucketName + "/output/logs/",
                "--enable-metrics": "",
                "--enable-continuous-cloudwatch-log": "true",
                "--source_BucketName": assetBucketName,
                "--target_BucketName": assetBucketName,
                "--target_covidPrefix": covidPath,
                "--target_hiringPrefix": hiringPath,
                "--covid_source_bucket": covid_src_bucket,
                "--obj_covid_source_key": covid_src_key,
                "--obj_covid_target_key": covidPath + obj_covidCases,
                "--hiring_source_bucket": hiring_src_bucket,
                "--obj_hiring_source_key": hiring_src_key,
                "--obj_hiring_target_key": hiringPath + obj_covidHiring,
                "--obj_1_source_key": f_pyAssetETL.s3ObjectKey,
                "--obj_1_target_key": scriptsPath + obj_assets,
                "--obj_2_source_key": f_pyParquet.s3ObjectKey,
                "--obj_2_target_key": scriptsPath + obj_etl,
                "--obj_3_source_key": f_pyRedshiftLoad.s3ObjectKey,
                "--obj_3_target_key": scriptsPath + obj_redshiftLoad,
            },
            maxRetries: 2,
            timeout: 60,
            numberOfWorkers: 10,
            glueVersion: "3.0",
            workerType: "G.1X",
        });
        const glue_job_parquet = new glue.CfnJob(this, "glue-job-parquet", {
            name: "glue-workflow-parquetjob",
            description: "Convert the csv files in S3 to parquet",
            role: glue_crawler_role.roleArn,
            executionProperty: {
                maxConcurrentRuns: 1,
            },
            command: {
                name: "glueetl",
                pythonVersion: "3",
                scriptLocation: "s3://" + f_pyParquet.s3BucketName + "/" + scriptsPath + obj_etl,
            },
            defaultArguments: {
                "--TempDir": "s3://" + assetBucketName + "/output/temp/",
                "--job-bookmark-option": "job-bookmark-disable",
                "--job-language": "python",
                "--spark-event-logs-path": "s3://" + assetBucketName + "/output/logs/",
                "--enable-metrics": "",
                "--enable-continuous-cloudwatch-log": "true",
                "--glue_database_name": glue_db.databaseName,
                "--glue_covid_table": covidCasesTable,
                "--glue_hiring_table": covidHiringTable,
                "--output_bucket_name": assetBucketName,
                "--output_prefix_path": parquetPath
            },
            maxRetries: 2,
            timeout: 240,
            numberOfWorkers: 10,
            glueVersion: "3.0",
            workerType: "G.1X",
        });
        //load parquet data into Redshift
        const glue_job_redshift_load = new glue.CfnJob(this, "glue-job-redshift-load", {
            name: "glue-workflow-redshift-load",
            description: "Use Glue to load output data into Redshift",
            role: glue_crawler_role.roleArn,
            executionProperty: {
                maxConcurrentRuns: 1,
            },
            command: {
                name: "glueetl",
                pythonVersion: "3",
                scriptLocation: "s3://" +
                    f_pyRedshiftLoad.s3BucketName +
                    "/" +
                    scriptsPath +
                    obj_redshiftLoad,
            },
            defaultArguments: {
                "--TempDir": redshift_temp_dir,
                "--job-bookmark-option": "job-bookmark-disable",
                "--job-language": "python",
                "--spark-event-logs-path": "s3://" + assetBucketName + "/output/logs/",
                "--enable-metrics": "",
                "--enable-continuous-cloudwatch-log": "true",
                "--glue_database_name": glue_db.databaseName,
                "--glue_input_file1": obj_redshiftLoad,
                "--output_bucket_name": assetBucketName,
            },
            connections: {
                connections: ["redshift-connect"],
            },
            maxRetries: 2,
            timeout: 240,
            numberOfWorkers: 10,
            glueVersion: "3.0",
            workerType: "G.1X",
        });
        //create triggers
        //rename assets and copy them to scripts folder
        const glue_trigger_assetJob = new glue.CfnTrigger(this, "glue-trigger-assetJob", {
            name: "Run-Job-" + glue_job_asset.name,
            workflowName: glue_workflow.name,
            actions: [
                {
                    jobName: glue_job_asset.name,
                    timeout: 120,
                },
            ],
            type: "ON_DEMAND",
        });
        //add trigger dependency on workflow and job
        glue_trigger_assetJob.addDependsOn(glue_job_asset);
        glue_trigger_assetJob.addDependsOn(glue_workflow);
        //crawl csv files located in S3 scripts folder
        const glue_trigger_crawlJob = new glue.CfnTrigger(this, "glue-trigger-crawlJob", {
            name: "Run-Crawler-" + glue_crawler_s3.name,
            workflowName: glue_workflow.name,
            actions: [
                {
                    crawlerName: glue_crawler_s3.name,
                },
            ],
            predicate: {
                conditions: [
                    {
                        logicalOperator: "EQUALS",
                        jobName: glue_job_asset.name,
                        state: "SUCCEEDED",
                    },
                ],
                logical: "ANY",
            },
            type: "CONDITIONAL",
            startOnCreation: true,
        });
        //etl job trigger to merge data and convert to parquet for Redshift load
        const glue_trigger_parquetJob = new glue.CfnTrigger(this, "glue-trigger-parquetJob", {
            name: "Run-Job-" + glue_job_parquet.name,
            workflowName: glue_workflow.name,
            actions: [
                {
                    jobName: glue_job_parquet.name,
                },
            ],
            predicate: {
                conditions: [
                    {
                        logicalOperator: "EQUALS",
                        crawlerName: glue_crawler_s3.name,
                        crawlState: "SUCCEEDED",
                    },
                ],
                logical: "ANY",
            },
            type: "CONDITIONAL",
            startOnCreation: true,
        });
        //crawl parquet files located in S3 output-data folder
        const glue_trigger_crawlJob_parquet = new glue.CfnTrigger(this, "glue-trigger-crawlJob-parquet", {
            name: "Run-Crawler-" + glue_crawler_s3_parquet.name,
            workflowName: glue_workflow.name,
            actions: [
                {
                    crawlerName: glue_crawler_s3_parquet.name,
                },
            ],
            predicate: {
                conditions: [
                    {
                        logicalOperator: "EQUALS",
                        jobName: glue_job_parquet.name,
                        state: "SUCCEEDED",
                    },
                ],
                logical: "ANY",
            },
            type: "CONDITIONAL",
            startOnCreation: true,
        });
        //create Glue job trigger to load output data into Redshift
        const glue_trigger_redshiftJob = new glue.CfnTrigger(this, "glue-trigger-redshiftJob", {
            name: "Run-Job-" + glue_job_redshift_load.name,
            workflowName: glue_workflow.name,
            actions: [
                {
                    jobName: glue_job_redshift_load.name,
                },
            ],
            predicate: {
                conditions: [
                    {
                        logicalOperator: "EQUALS",
                        crawlerName: glue_crawler_s3_parquet.name,
                        crawlState: "SUCCEEDED",
                    },
                ],
                logical: "ANY",
            },
            type: "CONDITIONAL",
            startOnCreation: true,
        });
        //add trigger dependency on workflow, job and crawler
        glue_trigger_crawlJob.addDependsOn(glue_job_asset);
        glue_trigger_parquetJob.addDependsOn(glue_trigger_crawlJob);
        glue_trigger_crawlJob_parquet.addDependsOn(glue_trigger_parquetJob);
        glue_trigger_redshiftJob.addDependsOn(glue_trigger_crawlJob_parquet);
    }
}
exports.BlogGlueWorkFlowStack = BlogGlueWorkFlowStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmxvZy1nbHVlLXdvcmtmbG93LXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYmxvZy1nbHVlLXdvcmtmbG93LXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxxRUFBcUU7QUFDckUsaUNBQWlDOzs7QUFFakMscUNBQXFDO0FBQ3JDLDBDQUEwQztBQUMxQywwREFBK0M7QUFDL0MsOENBTzBCO0FBQzFCLDZCQUE2QjtBQUU3Qix3RUFBd0U7QUFDeEUsTUFBTSxXQUFXLEdBQUcsVUFBVSxDQUFDO0FBQy9CLE1BQU0sU0FBUyxHQUFHLGFBQWEsQ0FBQztBQUNoQyxNQUFNLFVBQVUsR0FBRyxjQUFjLENBQUM7QUFDbEMsTUFBTSxlQUFlLEdBQUcsWUFBWSxDQUFDO0FBQ3JDLE1BQU0sZ0JBQWdCLEdBQUcsYUFBYSxDQUFBO0FBQ3RDLE1BQU0sV0FBVyxHQUFHLGtCQUFrQixDQUFBO0FBQ3RDLE1BQU0sZ0JBQWdCLEdBQUcsY0FBYyxDQUFDO0FBQ3hDLE1BQU0sYUFBYSxHQUFHLHVGQUF1RixDQUFDO0FBQzlHLE1BQU0saUJBQWlCLEdBQUcsNkJBQTZCLENBQUM7QUFDeEQsTUFBTSxjQUFjLEdBQUcsd0JBQXdCLENBQUM7QUFDaEQsTUFBTSxjQUFjLEdBQUcsaUJBQWlCLENBQUM7QUFDekMsTUFBTSxlQUFlLEdBQUcsa0JBQWtCLENBQUM7QUFDM0MsTUFBTSxVQUFVLEdBQUcsdUJBQXVCLENBQUM7QUFDM0MsTUFBTSxPQUFPLEdBQUcscUJBQXFCLENBQUM7QUFDdEMsTUFBTSxnQkFBZ0IsR0FBRyxzQkFBc0IsQ0FBQztBQUVoRCxpREFBaUQ7QUFDakQsTUFBTSxtQkFBbUIsR0FDdkIseURBQXlELENBQUM7QUFDNUQsTUFBTSxlQUFlLEdBQUcsb0JBQW9CLENBQUM7QUFFN0MsTUFBYSxxQkFBc0IsU0FBUSxHQUFHLENBQUMsS0FBSztJQUdsRCxZQUFZLEtBQWMsRUFBRSxFQUFVLEVBQUUsS0FBc0I7UUFDNUQsS0FBSyxDQUFD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QyxPQUFPLEVBQUU7Z0JBQ1A7b0JBQ0UsT0FBTyxFQUFFLHNCQUFzQixDQUFDLElBQUk7aUJBQ3JDO2FBQ0Y7WUFDRCxTQUFTLEVBQUU7Z0JBQ1QsVUFBVSxFQUFFO29CQUNWO3dCQUNFLGVBQWUsRUFBRSxRQUFRO3dCQUN6QixXQUFXLEVBQUUsdUJBQXVCLENBQUMsSUFBSTt3QkFDekMsVUFBVSxFQUFFLFdBQVc7cUJBQ3hCO2lCQUNGO2dCQUNELE9BQU8sRUFBRSxLQUFLO2FBQ2Y7WUFDRCxJQUFJLEVBQUUsYUFBYTtZQUNuQixlQUFlLEVBQUUsSUFBSTtTQUN0QixDQUNGLENBQUM7UUFFRixxREFBcUQ7UUFDckQscUJBQXFCLENBQUMsWUFBWSxDQUFDLGNBQWMsQ0FBQyxDQUFDO1FBQ25ELHVCQUF1QixDQUFDLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDO1FBQzVELDZCQUE2QixDQUFDLFlBQVksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQ3BFLHdCQUF3QixDQUFDLFlBQVksQ0FBQyw2QkFBNkIsQ0FBQyxDQUFDO0lBQ3ZFLENBQUM7Q0FDRjtBQXBZRCxzREFvWUMiLCJzb3VyY2VzQ29udGVudCI6WyIvLyBDb3B5cmlnaHQgQW1hem9uLmNvbSwgSW5jLiBvciBpdHMgYWZmaWxpYXRlcy4gQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbi8vIFNQRFgtTGljZW5zZS1JZGVudGlmaWVyOiBNSVQtMFxuXG5pbXBvcnQgKiBhcyBjZGsgZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCAqIGFzIGdsdWUgZnJvbSBcIkBhd3MtY2RrL2F3cy1nbHVlXCI7XG5pbXBvcnQgeyBBc3NldCB9IGZyb20gXCJAYXdzLWNkay9hd3MtczMtYXNzZXRzXCI7XG5pbXBvcnQge1xuICBSb2xlLFxuICBNYW5hZ2VkUG9saWN5LFxuICBTZXJ2aWNlUHJpbmNpcGFsLFxuICBQb2xpY3ksXG4gIFBvbGljeVN0YXRlbWVudCxcbiAgRWZmZWN0LFxufSBmcm9tIFwiQGF3cy1jZGsvYXdzLWlhbVwiO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tIFwicGF0aFwiO1xuXG4vL2RlZmluZSBtZWFuaW5nZnVsIHMzIG9iamVjdCBrZXlzIGZvciBjb3BpZWQgYXNzZXRzIGFuZCBpbnB1dCBDU1YgZmlsZXNcbmNvbnN0IHNjcmlwdHNQYXRoID0gXCJzY3JpcHRzL1wiO1xuY29uc3QgY292aWRQYXRoID0gXCJjb3ZpZC1kYXRhL1wiO1xuY29uc3QgaGlyaW5nUGF0aCA9IFwiaGlyaW5nLWRhdGEvXCI7XG5jb25zdCBjb3ZpZENhc2VzVGFibGUgPSBcImNvdmlkX2RhdGFcIjtcbmNvbnN0IGNvdmlkSGlyaW5nVGFibGUgPSBcImhpcmluZ19kYXRhXCJcbmNvbnN0IHBhcnF1ZXRQYXRoID0gXCIvcHJvY2Vzc2VkLWRhdGEvXCJcbmNvbnN0IGNvdmlkX3NyY19idWNrZXQgPSBcImNvdmlkMTktbGFrZVwiO1xuY29uc3QgY292aWRfc3JjX2tleSA9IFwicmVhcmMtY292aWQtMTktd29ybGQtY2FzZXMtZGVhdGhzLXRlc3RpbmcvY3N2L2NvdmlkLTE5LXdvcmxkLWNhc2VzLWRlYXRocy10ZXN0aW5nLmNzdlwiO1xuY29uc3QgaGlyaW5nX3NyY19idWNrZXQgPSBcImdyZWVud2ljaGhyLWNvdmlkam9iaW1wYWN0c1wiO1xuY29uc3QgaGlyaW5nX3NyY19rZXkgPSBcIm92ZXJhbGwuY3N2LnBhcnRfMDAwMDBcIjtcbmNvbnN0IG9ial9jb3ZpZENhc2VzID0gXCJjb3ZpZF9jYXNlcy5jc3ZcIjtcbmNvbnN0IG9ial9jb3ZpZEhpcmluZyA9IFwiY292aWRfaGlyaW5nLmNzdlwiO1xuY29uc3Qgb2JqX2Fzc2V0cyA9IFwiZ2x1ZS1jZGstYXNzZXQtZXRsLnB5XCI7XG5jb25zdCBvYmpfZXRsID0gXCJnbHVlLXBhcnF1ZXQtZXRsLnB5XCI7XG5jb25zdCBvYmpfcmVkc2hpZnRMb2FkID0gXCJyZWRzaGlmdC1sb2FkLWV0bC5weVwiO1xuXG4vL3NldCBBV1MgbWFuYWdlZCBwb2xpY3kgYXJuIGFuZCBnbHVlIHNlcnZpY2UgVVJMXG5jb25zdCBnbHVlX21hbmFnZWRfcG9saWN5ID1cbiAgXCJhcm46YXdzOmlhbTo6YXdzOnBvbGljeS9zZXJ2aWNlLXJvbGUvQVdTR2x1ZVNlcnZpY2VSb2xlXCI7XG5jb25zdCBnbHVlX1NlcnZpY2VVcmwgPSBcImdsdWUuYW1hem9uYXdzLmNvbVwiO1xuXG5leHBvcnQgY2xhc3MgQmxvZ0dsdWVXb3JrRmxvd1N0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGdsdWVSb2xlOiBSb2xlO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBjZGsuQXBwLCBpZDogc3RyaW5nLCBwcm9wcz86IGNkay5TdGFja1Byb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG5cbiAgICAvLyMjIyAgQWRkIGFzc2V0cyB0byBTMyBidWNrZXQgYXMgaW5kaXZpZHVhbCBmaWxlcyAgIyMjIyNcblxuICAgIC8vcHl0aG9uIHNjcmlwdHMgcnVuIGluIEdsdWUgV29ya2Zsb3dcbiAgICBjb25zdCBmX3B5QXNzZXRFVEwgPSBuZXcgQXNzZXQodGhpcywgXCJweS1hc3NldC1ldGxcIiwge1xuICAgICAgcGF0aDogcGF0aC5qb2luKF9fZGlybmFtZSwgXCJhc3NldHMvZ2x1ZS1jZGstYXNzZXQtZXRsLnB5XCIpLFxuICAgIH0pO1xuICAgIGNvbnN0IGZfcHlQYXJxdWV0ID0gbmV3IEFzc2V0KHRoaXMsIFwicHktbG9hZFwiLCB7XG4gICAgICBwYXRoOiBwYXRoLmpvaW4oX19kaXJuYW1lLCBcImFzc2V0cy9nbHVlLXBhcnF1ZXQtZXRsLnB5XCIpLFxuICAgIH0pO1xuICAgIGNvbnN0IGZfcHlSZWRzaGlmdExvYWQgPSBuZXcgQXNzZXQodGhpcywgXCJyZWRzaGlmdC1sb2FkXCIsIHtcbiAgICAgIHBhdGg6IHBhdGguam9pbihfX2Rpcm5hbWUsIFwiYXNzZXRzL3JlZHNoaWZ0LWxvYWQtZXRsLnB5XCIpLFxuICAgIH0pO1xuXG4gICAgLy9HZXQgZHluYW1pYyBDREsgYXNzZXQgYnVja2V0IG5hbWUgdG8gcGFzcyBpbnRvIEdsdWUgSm9ic1xuICAgIGNvbnN0IGFzc2V0QnVja2V0TmFtZSA9IGZfcHlBc3NldEVUTC5zM0J1Y2tldE5hbWU7XG5cbiAgICAvL2NyZWF0ZSBnbHVlIGRhdGFiYXNlXG4gICAgY29uc3QgZ2x1ZV9kYiA9IG5ldyBnbHVlLkRhdGFiYXNlKHRoaXMsIFwiZ2x1ZS13b3JrZmxvdy1kYlwiLCB7XG4gICAgICBkYXRhYmFzZU5hbWU6IFwiZ2x1ZS13b3JrZmxvdy1kYlwiLFxuICAgIH0pO1xuXG4gICAgLy9jcmVhdGUgZ2x1ZSBjcmFsd2VyIHJvbGUgdG8gYWNjZXNzIFMzIGJ1Y2tldFxuICAgIGNvbnN0IGdsdWVfY3Jhd2xlcl9yb2xlID0gbmV3IFJvbGUodGhpcywgXCJnbHVlLWNyYXdsZXItcm9sZVwiLCB7XG4gICAgICByb2xlTmFtZTogXCJBV1NHbHVlU2VydmljZVJvbGUtQWNjZXNzUzNCdWNrZXRcIixcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICBcIkFzc2lnbnMgdGhlIG1hbmFnZWQgcG9saWN5IEFXU0dsdWVTZXJ2aWNlUm9sZSB0byBBV1MgR2x1ZSBDcmF3bGVyIHNvIGl0IGNhbiBjcmF3bCBTMyBidWNrZXRzXCIsXG4gICAgICBtYW5hZ2VkUG9saWNpZXM6IFtcbiAgICAgICAgTWFuYWdlZFBvbGljeS5mcm9tTWFuYWdlZFBvbGljeUFybihcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgIFwiZ2x1ZS1zZXJ2aWNlLXBvbGljeVwiLFxuICAgICAgICAgIGdsdWVfbWFuYWdlZF9wb2xpY3lcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgICBhc3N1bWVkQnk6IG5ldyBTZXJ2aWNlUHJpbmNpcGFsKGdsdWVfU2VydmljZVVybCksXG4gICAgfSk7XG4gICAgdGhpcy5nbHVlUm9sZSA9IGdsdWVfY3Jhd2xlcl9yb2xlO1xuXG4gICAgLy9hZGQgcG9saWN5IHRvIHJvbGUgdG8gZ3JhbnQgYWNjZXNzIHRvIFMzIGFzc2V0IGJ1Y2tldCBhbmQgcHVibGljIGJ1Y2tldHNcbiAgICBjb25zdCBpYW1fcG9saWN5X2ZvckFzc2V0cyA9IG5ldyBQb2xpY3kodGhpcywgXCJpYW0tcG9saWN5LWZvckFzc2V0c1wiLCB7XG4gICAgICBmb3JjZTogdHJ1ZSxcbiAgICAgIHBvbGljeU5hbWU6IFwiZ2x1ZS1wb2xpY3ktd29ya2Zsb3dBc3NldEFjY2Vzc1wiLFxuICAgICAgcm9sZXM6IFtnbHVlX2NyYXdsZXJfcm9sZV0sXG4gICAgICBzdGF0ZW1lbnRzOiBbXG4gICAgICAgIG5ldyBQb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogRWZmZWN0LkFMTE9XLFxuICAgICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICAgIFwiczM6R2V0T2JqZWN0XCIsXG4gICAgICAgICAgICBcInMzOlB1dE9iamVjdFwiLFxuICAgICAgICAgICAgXCJzMzpEZWxldGVPYmplY3RcIixcbiAgICAgICAgICAgIFwiczM6TGlzdEJ1Y2tldFwiLFxuICAgICAgICAgIF0sXG4gICAgICAgICAgcmVzb3VyY2VzOiBbXCJhcm46YXdzOnMzOjo6XCIgKyBmX3B5QXNzZXRFVEwuczNCdWNrZXROYW1lICsgXCIvKlwiXSxcbiAgICAgICAgfSksXG4gICAgICAgIG5ldyBQb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICAgIGVmZmVjdDogRWZmZWN0LkFMTE9XLFxuICAgICAgICAgIGFjdGlvbnM6IFtcInMzOkdldE9iamVjdFwiXSxcbiAgICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICAgIFwiYXJuOmF3czpzMzo6OlwiICsgY292aWRfc3JjX2J1Y2tldCArIFwiLypcIixcbiAgICAgICAgICAgIFwiYXJuOmF3czpzMzo6OlwiICsgaGlyaW5nX3NyY19idWNrZXQgKyBcIi8qXCIsXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy9EZWZpbmUgcGF0aHMgZm9yIHNjcmlwdHMgYW5kIGRhdGFcbiAgICBjb25zdCBzY3JpcHRzID0gXCJzMzovL1wiICsgYXNzZXRCdWNrZXROYW1lICsgXCIvXCIgKyBzY3JpcHRzUGF0aDtcbiAgICBjb25zdCBjb3ZpZCA9IFwiczM6Ly9cIiArIGFzc2V0QnVja2V0TmFtZSArIFwiL1wiICsgY292aWRQYXRoO1xuICAgIGNvbnN0IGhpcmluZyA9IFwiczM6Ly9cIiArIGFzc2V0QnVja2V0TmFtZSArIFwiL1wiICsgaGlyaW5nUGF0aDtcbiAgICBjb25zdCByZWRzaGlmdF90ZW1wX2RpciA9IFwiczM6Ly9cIiArIGFzc2V0QnVja2V0TmFtZSArIFwiL291dHB1dC90ZW1wL1wiO1xuICAgIGNvbnN0IG91dHB1dFBhdGggPSBcInMzOi8vXCIgKyBhc3NldEJ1Y2tldE5hbWUgKyBwYXJxdWV0UGF0aDtcblxuICAgIC8vY3JlYXRlIGdsdWUgY3Jhd2xlciB0byBjcmF3bCBjc3YgZmlsZXMgaW4gUzNcbiAgICBjb25zdCBnbHVlX2NyYXdsZXJfczMgPSBuZXcgZ2x1ZS5DZm5DcmF3bGVyKHRoaXMsIFwiZ2x1ZS1jcmF3bGVyLXMzXCIsIHtcbiAgICAgIG5hbWU6IFwiczMtY3N2LWNyYXdsZXJcIixcbiAgICAgIHJvbGU6IGdsdWVfY3Jhd2xlcl9yb2xlLnJvbGVOYW1lLFxuICAgICAgdGFyZ2V0czoge1xuICAgICAgICBzM1RhcmdldHM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBwYXRoOiBjb3ZpZFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgcGF0aDogaGlyaW5nXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgICBkYXRhYmFzZU5hbWU6IGdsdWVfZGIuZGF0YWJhc2VOYW1lLFxuICAgICAgc2NoZW1hQ2hhbmdlUG9saWN5OiB7XG4gICAgICAgIHVwZGF0ZUJlaGF2aW9yOiBcIlVQREFURV9JTl9EQVRBQkFTRVwiLFxuICAgICAgICBkZWxldGVCZWhhdmlvcjogXCJERVBSRUNBVEVfSU5fREFUQUJBU0VcIixcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvL2NyZWF0ZSBnbHVlIGNyYXdsZXIgdG8gY3Jhd2wgcGFycWV0IGZpbGVzIGluIFMzXG4gICAgY29uc3QgZ2x1ZV9jcmF3bGVyX3MzX3BhcnF1ZXQgPSBuZXcgZ2x1ZS5DZm5DcmF3bGVyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiZ2x1ZS1jcmF3bGVyLXMzLXBhcnF1ZXRcIixcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJzMy1wYXJxdWV0LWNyYXdsZXJcIixcbiAgICAgICAgcm9sZTogZ2x1ZV9jcmF3bGVyX3JvbGUucm9sZU5hbWUsXG4gICAgICAgIHRhcmdldHM6IHtcbiAgICAgICAgICBzM1RhcmdldHM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgcGF0aDogb3V0cHV0UGF0aCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSxcbiAgICAgICAgZGF0YWJhc2VOYW1lOiBnbHVlX2RiLmRhdGFiYXNlTmFtZSxcbiAgICAgICAgc2NoZW1hQ2hhbmdlUG9saWN5OiB7XG4gICAgICAgICAgdXBkYXRlQmVoYXZpb3I6IFwiVVBEQVRFX0lOX0RBVEFCQVNFXCIsXG4gICAgICAgICAgZGVsZXRlQmVoYXZpb3I6IFwiREVQUkVDQVRFX0lOX0RBVEFCQVNFXCIsXG4gICAgICAgIH0sXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vIyMjIyAgQ3JlYXRlIHRoZSBnbHVlIHdvcmtmbG93LCBqb2JzIGFuZCB0cmlnZ2VycyB0aGF0IHdpbGwgaGFuZGxlIHRoZSBFVEwgdG8gY29udmVydCBDU1YgdG8gUGFycXVldCBhbmQgbG9hZCB0aGUgcGFycXVldCBmaWxlIGludG8gUmVkc2hpZnQgIyMjIyNcblxuICAgIC8vY3JlYXRlIGdsdWUgd29ya2Zsb3dcbiAgICBjb25zdCBnbHVlX3dvcmtmbG93ID0gbmV3IGdsdWUuQ2ZuV29ya2Zsb3codGhpcywgXCJyZC1kbC1wYS1qb2JtYXJ0LXJhdy13b3JrZmxvd1wiLCB7XG4gICAgICBuYW1lOiBcImdsdWUtd29ya2Zsb3dcIixcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICBcIkVUTCB3b3JrZmxvdyB0byBjb252ZXJ0IENTViB0byBwYXJxdWV0IGFuZCB0aGVuIGxvYWQgaW50byBSZWRzaGlmdFwiLFxuICAgIH0pO1xuXG4gICAgLy9jcmVhdGUgam9ic1xuICAgIGNvbnN0IGdsdWVfam9iX2Fzc2V0ID0gbmV3IGdsdWUuQ2ZuSm9iKHRoaXMsIFwiZ2x1ZS1qb2ItYXNzZXRcIiwge1xuICAgICAgbmFtZTogXCJnbHVlLXdvcmtmbG93LWFzc2V0am9iXCIsXG4gICAgICBkZXNjcmlwdGlvbjogXCJDb3B5IENESyBhc3NldHMgdG8gc2NyaXB0cyBmb2xkZXIgYW5kIGdpdmUgbWVhbmluZ2Z1bCBuYW1lXCIsXG4gICAgICByb2xlOiBnbHVlX2NyYXdsZXJfcm9sZS5yb2xlQXJuLFxuICAgICAgZXhlY3V0aW9uUHJvcGVydHk6IHtcbiAgICAgICAgbWF4Q29uY3VycmVudFJ1bnM6IDEsXG4gICAgICB9LFxuICAgICAgY29tbWFuZDoge1xuICAgICAgICBuYW1lOiBcImdsdWVldGxcIixcbiAgICAgICAgcHl0aG9uVmVyc2lvbjogXCIzXCIsXG4gICAgICAgIHNjcmlwdExvY2F0aW9uOiBmX3B5QXNzZXRFVEwuczNPYmplY3RVcmwsXG4gICAgICB9LFxuICAgICAgZGVmYXVsdEFyZ3VtZW50czoge1xuICAgICAgICBcIi0tVGVtcERpclwiOiBcInMzOi8vXCIgKyBmX3B5QXNzZXRFVEwuczNCdWNrZXROYW1lICsgXCIvb3V0cHV0L3RlbXAvXCIsXG4gICAgICAgIFwiLS1qb2ItYm9va21hcmstb3B0aW9uXCI6IFwiam9iLWJvb2ttYXJrLWRpc2FibGVcIixcbiAgICAgICAgXCItLWpvYi1sYW5ndWFnZVwiOiBcInB5dGhvblwiLFxuICAgICAgICBcIi0tc3BhcmstZXZlbnQtbG9ncy1wYXRoXCI6XG4gICAgICAgICAgXCJzMzovL1wiICsgZl9weUFzc2V0RVRMLnMzQnVja2V0TmFtZSArIFwiL291dHB1dC9sb2dzL1wiLFxuICAgICAgICBcIi0tZW5hYmxlLW1ldHJpY3NcIjogXCJcIixcbiAgICAgICAgXCItLWVuYWJsZS1jb250aW51b3VzLWNsb3Vkd2F0Y2gtbG9nXCI6IFwidHJ1ZVwiLFxuICAgICAgICBcIi0tc291cmNlX0J1Y2tldE5hbWVcIjogYXNzZXRCdWNrZXROYW1lLFxuICAgICAgICBcIi0tdGFyZ2V0X0J1Y2tldE5hbWVcIjogYXNzZXRCdWNrZXROYW1lLFxuICAgICAgICBcIi0tdGFyZ2V0X2NvdmlkUHJlZml4XCI6IGNvdmlkUGF0aCxcbiAgICAgICAgXCItLXRhcmdldF9oaXJpbmdQcmVmaXhcIjogaGlyaW5nUGF0aCxcbiAgICAgICAgXCItLWNvdmlkX3NvdXJjZV9idWNrZXRcIjogY292aWRfc3JjX2J1Y2tldCxcbiAgICAgICAgXCItLW9ial9jb3ZpZF9zb3VyY2Vfa2V5XCI6IGNvdmlkX3NyY19rZXksXG4gICAgICAgIFwiLS1vYmpfY292aWRfdGFyZ2V0X2tleVwiOiBjb3ZpZFBhdGggKyBvYmpfY292aWRDYXNlcyxcbiAgICAgICAgXCItLWhpcmluZ19zb3VyY2VfYnVja2V0XCI6IGhpcmluZ19zcmNfYnVja2V0LFxuICAgICAgICBcIi0tb2JqX2hpcmluZ19zb3VyY2Vfa2V5XCI6IGhpcmluZ19zcmNfa2V5LFxuICAgICAgICBcIi0tb2JqX2hpcmluZ190YXJnZXRfa2V5XCI6IGhpcmluZ1BhdGggKyBvYmpfY292aWRIaXJpbmcsXG4gICAgICAgIFwiLS1vYmpfMV9zb3VyY2Vfa2V5XCI6IGZfcHlBc3NldEVUTC5zM09iamVjdEtleSxcbiAgICAgICAgXCItLW9ial8xX3RhcmdldF9rZXlcIjogc2NyaXB0c1BhdGggKyBvYmpfYXNzZXRzLFxuICAgICAgICBcIi0tb2JqXzJfc291cmNlX2tleVwiOiBmX3B5UGFycXVldC5zM09iamVjdEtleSxcbiAgICAgICAgXCItLW9ial8yX3RhcmdldF9rZXlcIjogc2NyaXB0c1BhdGggKyBvYmpfZXRsLFxuICAgICAgICBcIi0tb2JqXzNfc291cmNlX2tleVwiOiBmX3B5UmVkc2hpZnRMb2FkLnMzT2JqZWN0S2V5LFxuICAgICAgICBcIi0tb2JqXzNfdGFyZ2V0X2tleVwiOiBzY3JpcHRzUGF0aCArIG9ial9yZWRzaGlmdExvYWQsXG4gICAgICB9LFxuICAgICAgbWF4UmV0cmllczogMixcbiAgICAgIHRpbWVvdXQ6IDYwLFxuICAgICAgbnVtYmVyT2ZXb3JrZXJzOiAxMCxcbiAgICAgIGdsdWVWZXJzaW9uOiBcIjMuMFwiLFxuICAgICAgd29ya2VyVHlwZTogXCJHLjFYXCIsXG4gICAgfSk7XG5cbiAgICBjb25zdCBnbHVlX2pvYl9wYXJxdWV0ID0gbmV3IGdsdWUuQ2ZuSm9iKHRoaXMsIFwiZ2x1ZS1qb2ItcGFycXVldFwiLCB7XG4gICAgICBuYW1lOiBcImdsdWUtd29ya2Zsb3ctcGFycXVldGpvYlwiLFxuICAgICAgZGVzY3JpcHRpb246IFwiQ29udmVydCB0aGUgY3N2IGZpbGVzIGluIFMzIHRvIHBhcnF1ZXRcIixcbiAgICAgIHJvbGU6IGdsdWVfY3Jhd2xlcl9yb2xlLnJvbGVBcm4sXG4gICAgICBleGVjdXRpb25Qcm9wZXJ0eToge1xuICAgICAgICBtYXhDb25jdXJyZW50UnVuczogMSxcbiAgICAgIH0sXG4gICAgICBjb21tYW5kOiB7XG4gICAgICAgIG5hbWU6IFwiZ2x1ZWV0bFwiLCAvL3NwYXJrIEVUTCBqb2IgbXVzdCBiZSBzZXQgdG8gdmFsdWUgb2YgJ2dsdWVldGwnXG4gICAgICAgIHB5dGhvblZlcnNpb246IFwiM1wiLFxuICAgICAgICBzY3JpcHRMb2NhdGlvbjpcbiAgICAgICAgICBcInMzOi8vXCIgKyBmX3B5UGFycXVldC5zM0J1Y2tldE5hbWUgKyBcIi9cIiArIHNjcmlwdHNQYXRoICsgb2JqX2V0bCxcbiAgICAgIH0sXG4gICAgICBkZWZhdWx0QXJndW1lbnRzOiB7XG4gICAgICAgIFwiLS1UZW1wRGlyXCI6IFwiczM6Ly9cIiArIGFzc2V0QnVja2V0TmFtZSArIFwiL291dHB1dC90ZW1wL1wiLFxuICAgICAgICBcIi0tam9iLWJvb2ttYXJrLW9wdGlvblwiOiBcImpvYi1ib29rbWFyay1kaXNhYmxlXCIsXG4gICAgICAgIFwiLS1qb2ItbGFuZ3VhZ2VcIjogXCJweXRob25cIixcbiAgICAgICAgXCItLXNwYXJrLWV2ZW50LWxvZ3MtcGF0aFwiOlxuICAgICAgICAgIFwiczM6Ly9cIiArIGFzc2V0QnVja2V0TmFtZSArIFwiL291dHB1dC9sb2dzL1wiLFxuICAgICAgICBcIi0tZW5hYmxlLW1ldHJpY3NcIjogXCJcIixcbiAgICAgICAgXCItLWVuYWJsZS1jb250aW51b3VzLWNsb3Vkd2F0Y2gtbG9nXCI6IFwidHJ1ZVwiLFxuICAgICAgICBcIi0tZ2x1ZV9kYXRhYmFzZV9uYW1lXCI6IGdsdWVfZGIuZGF0YWJhc2VOYW1lLFxuICAgICAgICBcIi0tZ2x1ZV9jb3ZpZF90YWJsZVwiOiBjb3ZpZENhc2VzVGFibGUsXG4gICAgICAgIFwiLS1nbHVlX2hpcmluZ190YWJsZVwiOiBjb3ZpZEhpcmluZ1RhYmxlLFxuICAgICAgICBcIi0tb3V0cHV0X2J1Y2tldF9uYW1lXCI6IGFzc2V0QnVja2V0TmFtZSxcbiAgICAgICAgXCItLW91dHB1dF9wcmVmaXhfcGF0aFwiOiBwYXJxdWV0UGF0aFxuICAgICAgfSxcbiAgICAgIG1heFJldHJpZXM6IDIsXG4gICAgICB0aW1lb3V0OiAyNDAsXG4gICAgICBudW1iZXJPZldvcmtlcnM6IDEwLFxuICAgICAgZ2x1ZVZlcnNpb246IFwiMy4wXCIsXG4gICAgICB3b3JrZXJUeXBlOiBcIkcuMVhcIixcbiAgICB9KTtcblxuICAgIC8vbG9hZCBwYXJxdWV0IGRhdGEgaW50byBSZWRzaGlmdFxuICAgIGNvbnN0IGdsdWVfam9iX3JlZHNoaWZ0X2xvYWQgPSBuZXcgZ2x1ZS5DZm5Kb2IoXG4gICAgICB0aGlzLFxuICAgICAgXCJnbHVlLWpvYi1yZWRzaGlmdC1sb2FkXCIsXG4gICAgICB7XG4gICAgICAgIG5hbWU6IFwiZ2x1ZS13b3JrZmxvdy1yZWRzaGlmdC1sb2FkXCIsXG4gICAgICAgIGRlc2NyaXB0aW9uOiBcIlVzZSBHbHVlIHRvIGxvYWQgb3V0cHV0IGRhdGEgaW50byBSZWRzaGlmdFwiLFxuICAgICAgICByb2xlOiBnbHVlX2NyYXdsZXJfcm9sZS5yb2xlQXJuLFxuICAgICAgICBleGVjdXRpb25Qcm9wZXJ0eToge1xuICAgICAgICAgIG1heENvbmN1cnJlbnRSdW5zOiAxLFxuICAgICAgICB9LFxuICAgICAgICBjb21tYW5kOiB7XG4gICAgICAgICAgbmFtZTogXCJnbHVlZXRsXCIsIC8vc3BhcmsgRVRMIGpvYiBtdXN0IGJlIHNldCB0byB2YWx1ZSBvZiAnZ2x1ZWV0bCdcbiAgICAgICAgICBweXRob25WZXJzaW9uOiBcIjNcIixcbiAgICAgICAgICBzY3JpcHRMb2NhdGlvbjpcbiAgICAgICAgICAgIFwiczM6Ly9cIiArXG4gICAgICAgICAgICBmX3B5UmVkc2hpZnRMb2FkLnMzQnVja2V0TmFtZSArXG4gICAgICAgICAgICBcIi9cIiArXG4gICAgICAgICAgICBzY3JpcHRzUGF0aCArXG4gICAgICAgICAgICBvYmpfcmVkc2hpZnRMb2FkLFxuICAgICAgICB9LFxuICAgICAgICBkZWZhdWx0QXJndW1lbnRzOiB7XG4gICAgICAgICAgXCItLVRlbXBEaXJcIjogcmVkc2hpZnRfdGVtcF9kaXIsXG4gICAgICAgICAgXCItLWpvYi1ib29rbWFyay1vcHRpb25cIjogXCJqb2ItYm9va21hcmstZGlzYWJsZVwiLFxuICAgICAgICAgIFwiLS1qb2ItbGFuZ3VhZ2VcIjogXCJweXRob25cIixcbiAgICAgICAgICBcIi0tc3BhcmstZXZlbnQtbG9ncy1wYXRoXCI6XG4gICAgICAgICAgICBcInMzOi8vXCIgKyBhc3NldEJ1Y2tldE5hbWUgKyBcIi9vdXRwdXQvbG9ncy9cIixcbiAgICAgICAgICBcIi0tZW5hYmxlLW1ldHJpY3NcIjogXCJcIixcbiAgICAgICAgICBcIi0tZW5hYmxlLWNvbnRpbnVvdXMtY2xvdWR3YXRjaC1sb2dcIjogXCJ0cnVlXCIsXG4gICAgICAgICAgXCItLWdsdWVfZGF0YWJhc2VfbmFtZVwiOiBnbHVlX2RiLmRhdGFiYXNlTmFtZSxcbiAgICAgICAgICBcIi0tZ2x1ZV9pbnB1dF9maWxlMVwiOiBvYmpfcmVkc2hpZnRMb2FkLFxuICAgICAgICAgIFwiLS1vdXRwdXRfYnVja2V0X25hbWVcIjogYXNzZXRCdWNrZXROYW1lLFxuICAgICAgICB9LFxuICAgICAgICBjb25uZWN0aW9uczoge1xuICAgICAgICAgIGNvbm5lY3Rpb25zOiBbXCJyZWRzaGlmdC1jb25uZWN0XCJdLFxuICAgICAgICB9LFxuICAgICAgICBtYXhSZXRyaWVzOiAyLFxuICAgICAgICB0aW1lb3V0OiAyNDAsXG4gICAgICAgIG51bWJlck9mV29ya2VyczogMTAsXG4gICAgICAgIGdsdWVWZXJzaW9uOiBcIjMuMFwiLFxuICAgICAgICB3b3JrZXJUeXBlOiBcIkcuMVhcIixcbiAgICAgIH1cbiAgICApO1xuXG4gICAgLy9jcmVhdGUgdHJpZ2dlcnNcblxuICAgIC8vcmVuYW1lIGFzc2V0cyBhbmQgY29weSB0aGVtIHRvIHNjcmlwdHMgZm9sZGVyXG4gICAgY29uc3QgZ2x1ZV90cmlnZ2VyX2Fzc2V0Sm9iID0gbmV3IGdsdWUuQ2ZuVHJpZ2dlcihcbiAgICAgIHRoaXMsXG4gICAgICBcImdsdWUtdHJpZ2dlci1hc3NldEpvYlwiLFxuICAgICAge1xuICAgICAgICBuYW1lOiBcIlJ1bi1Kb2ItXCIgKyBnbHVlX2pvYl9hc3NldC5uYW1lLFxuICAgICAgICB3b3JrZmxvd05hbWU6IGdsdWVfd29ya2Zsb3cubmFtZSxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGpvYk5hbWU6IGdsdWVfam9iX2Fzc2V0Lm5hbWUsXG4gICAgICAgICAgICB0aW1lb3V0OiAxMjAsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgdHlwZTogXCJPTl9ERU1BTkRcIixcbiAgICAgIH1cbiAgICApO1xuICAgIC8vYWRkIHRyaWdnZXIgZGVwZW5kZW5jeSBvbiB3b3JrZmxvdyBhbmQgam9iXG4gICAgZ2x1ZV90cmlnZ2VyX2Fzc2V0Sm9iLmFkZERlcGVuZHNPbihnbHVlX2pvYl9hc3NldCk7XG4gICAgZ2x1ZV90cmlnZ2VyX2Fzc2V0Sm9iLmFkZERlcGVuZHNPbihnbHVlX3dvcmtmbG93KTtcblxuICAgIC8vY3Jhd2wgY3N2IGZpbGVzIGxvY2F0ZWQgaW4gUzMgc2NyaXB0cyBmb2xkZXJcbiAgICBjb25zdCBnbHVlX3RyaWdnZXJfY3Jhd2xKb2IgPSBuZXcgZ2x1ZS5DZm5UcmlnZ2VyKFxuICAgICAgdGhpcyxcbiAgICAgIFwiZ2x1ZS10cmlnZ2VyLWNyYXdsSm9iXCIsXG4gICAgICB7XG4gICAgICAgIG5hbWU6IFwiUnVuLUNyYXdsZXItXCIgKyBnbHVlX2NyYXdsZXJfczMubmFtZSxcbiAgICAgICAgd29ya2Zsb3dOYW1lOiBnbHVlX3dvcmtmbG93Lm5hbWUsXG4gICAgICAgIGFjdGlvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBjcmF3bGVyTmFtZTogZ2x1ZV9jcmF3bGVyX3MzLm5hbWUsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgcHJlZGljYXRlOiB7XG4gICAgICAgICAgY29uZGl0aW9uczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBsb2dpY2FsT3BlcmF0b3I6IFwiRVFVQUxTXCIsXG4gICAgICAgICAgICAgIGpvYk5hbWU6IGdsdWVfam9iX2Fzc2V0Lm5hbWUsXG4gICAgICAgICAgICAgIHN0YXRlOiBcIlNVQ0NFRURFRFwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGxvZ2ljYWw6IFwiQU5ZXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHR5cGU6IFwiQ09ORElUSU9OQUxcIixcbiAgICAgICAgc3RhcnRPbkNyZWF0aW9uOiB0cnVlLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvL2V0bCBqb2IgdHJpZ2dlciB0byBtZXJnZSBkYXRhIGFuZCBjb252ZXJ0IHRvIHBhcnF1ZXQgZm9yIFJlZHNoaWZ0IGxvYWRcbiAgICBjb25zdCBnbHVlX3RyaWdnZXJfcGFycXVldEpvYiA9IG5ldyBnbHVlLkNmblRyaWdnZXIoXG4gICAgICB0aGlzLFxuICAgICAgXCJnbHVlLXRyaWdnZXItcGFycXVldEpvYlwiLFxuICAgICAge1xuICAgICAgICBuYW1lOiBcIlJ1bi1Kb2ItXCIgKyBnbHVlX2pvYl9wYXJxdWV0Lm5hbWUsXG4gICAgICAgIHdvcmtmbG93TmFtZTogZ2x1ZV93b3JrZmxvdy5uYW1lLFxuICAgICAgICBhY3Rpb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgam9iTmFtZTogZ2x1ZV9qb2JfcGFycXVldC5uYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIHByZWRpY2F0ZToge1xuICAgICAgICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbG9naWNhbE9wZXJhdG9yOiBcIkVRVUFMU1wiLFxuICAgICAgICAgICAgICBjcmF3bGVyTmFtZTogZ2x1ZV9jcmF3bGVyX3MzLm5hbWUsXG4gICAgICAgICAgICAgIGNyYXdsU3RhdGU6IFwiU1VDQ0VFREVEXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgbG9naWNhbDogXCJBTllcIixcbiAgICAgICAgfSxcbiAgICAgICAgdHlwZTogXCJDT05ESVRJT05BTFwiLFxuICAgICAgICBzdGFydE9uQ3JlYXRpb246IHRydWUsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vY3Jhd2wgcGFycXVldCBmaWxlcyBsb2NhdGVkIGluIFMzIG91dHB1dC1kYXRhIGZvbGRlclxuICAgIGNvbnN0IGdsdWVfdHJpZ2dlcl9jcmF3bEpvYl9wYXJxdWV0ID0gbmV3IGdsdWUuQ2ZuVHJpZ2dlcihcbiAgICAgIHRoaXMsXG4gICAgICBcImdsdWUtdHJpZ2dlci1jcmF3bEpvYi1wYXJxdWV0XCIsXG4gICAgICB7XG4gICAgICAgIG5hbWU6IFwiUnVuLUNyYXdsZXItXCIgKyBnbHVlX2NyYXdsZXJfczNfcGFycXVldC5uYW1lLFxuICAgICAgICB3b3JrZmxvd05hbWU6IGdsdWVfd29ya2Zsb3cubmFtZSxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGNyYXdsZXJOYW1lOiBnbHVlX2NyYXdsZXJfczNfcGFycXVldC5uYW1lLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIHByZWRpY2F0ZToge1xuICAgICAgICAgIGNvbmRpdGlvbnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgbG9naWNhbE9wZXJhdG9yOiBcIkVRVUFMU1wiLFxuICAgICAgICAgICAgICBqb2JOYW1lOiBnbHVlX2pvYl9wYXJxdWV0Lm5hbWUsXG4gICAgICAgICAgICAgIHN0YXRlOiBcIlNVQ0NFRURFRFwiLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICAgIGxvZ2ljYWw6IFwiQU5ZXCIsXG4gICAgICAgIH0sXG4gICAgICAgIHR5cGU6IFwiQ09ORElUSU9OQUxcIixcbiAgICAgICAgc3RhcnRPbkNyZWF0aW9uOiB0cnVlLFxuICAgICAgfVxuICAgICk7XG5cbiAgICAvL2NyZWF0ZSBHbHVlIGpvYiB0cmlnZ2VyIHRvIGxvYWQgb3V0cHV0IGRhdGEgaW50byBSZWRzaGlmdFxuICAgIGNvbnN0IGdsdWVfdHJpZ2dlcl9yZWRzaGlmdEpvYiA9IG5ldyBnbHVlLkNmblRyaWdnZXIoXG4gICAgICB0aGlzLFxuICAgICAgXCJnbHVlLXRyaWdnZXItcmVkc2hpZnRKb2JcIixcbiAgICAgIHtcbiAgICAgICAgbmFtZTogXCJSdW4tSm9iLVwiICsgZ2x1ZV9qb2JfcmVkc2hpZnRfbG9hZC5uYW1lLFxuICAgICAgICB3b3JrZmxvd05hbWU6IGdsdWVfd29ya2Zsb3cubmFtZSxcbiAgICAgICAgYWN0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGpvYk5hbWU6IGdsdWVfam9iX3JlZHNoaWZ0X2xvYWQubmFtZSxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBwcmVkaWNhdGU6IHtcbiAgICAgICAgICBjb25kaXRpb25zOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGxvZ2ljYWxPcGVyYXRvcjogXCJFUVVBTFNcIixcbiAgICAgICAgICAgICAgY3Jhd2xlck5hbWU6IGdsdWVfY3Jhd2xlcl9zM19wYXJxdWV0Lm5hbWUsXG4gICAgICAgICAgICAgIGNyYXdsU3RhdGU6IFwiU1VDQ0VFREVEXCIsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgICAgbG9naWNhbDogXCJBTllcIixcbiAgICAgICAgfSxcbiAgICAgICAgdHlwZTogXCJDT05ESVRJT05BTFwiLFxuICAgICAgICBzdGFydE9uQ3JlYXRpb246IHRydWUsXG4gICAgICB9XG4gICAgKTtcblxuICAgIC8vYWRkIHRyaWdnZXIgZGVwZW5kZW5jeSBvbiB3b3JrZmxvdywgam9iIGFuZCBjcmF3bGVyXG4gICAgZ2x1ZV90cmlnZ2VyX2NyYXdsSm9iLmFkZERlcGVuZHNPbihnbHVlX2pvYl9hc3NldCk7XG4gICAgZ2x1ZV90cmlnZ2VyX3BhcnF1ZXRKb2IuYWRkRGVwZW5kc09uKGdsdWVfdHJpZ2dlcl9jcmF3bEpvYik7XG4gICAgZ2x1ZV90cmlnZ2VyX2NyYXdsSm9iX3BhcnF1ZXQuYWRkRGVwZW5kc09uKGdsdWVfdHJpZ2dlcl9wYXJxdWV0Sm9iKTtcbiAgICBnbHVlX3RyaWdnZXJfcmVkc2hpZnRKb2IuYWRkRGVwZW5kc09uKGdsdWVfdHJpZ2dlcl9jcmF3bEpvYl9wYXJxdWV0KTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFJlZHNoaWZ0VnBjU3RhY2tQcm9wcyBleHRlbmRzIGNkay5TdGFja1Byb3BzIHtcbiAgZ2x1ZVJvbGVHcmFudFNlY3JldFJlYWQ6IFJvbGU7XG59XG4iXX0=