import sys
import time
from awsglue.transforms import *
from awsglue.utils import getResolvedOptions
from pyspark.context import SparkContext
from awsglue.context import GlueContext
from awsglue.dynamicframe import DynamicFrame
from pyspark.sql.functions import *
from awsglue.job import Job
import json
# @params: [JOB_NAME]
args = getResolvedOptions(sys.argv,['JOB_NAME','job_directory', 'partition_column'])

# Spark context:
sc = SparkContext.getOrCreate()
glueContext = GlueContext(sc)
spark = glueContext.spark_session

# Job init:
job = Job(glueContext)
job.init(args['JOB_NAME'], args)
logger = glueContext.get_logger()

# Glue Catalog parameters:
glue_job = args['JOB_NAME']
job_directory = args['job_directory']
partition_column = args['partition_column']

# Begin variables to customize with your information
glue_temp_storage = "s3://rd-dl-pa-107495021244/temp"
glue_relationalize_output_s3_path = "s3://rd-dl-pa-107495021244/processed/" + job_directory
glue_path = "s3://rd-dl-pa-107495021244/raw/" + job_directory 
dfc_root_table_name = "jsonBody"

# Starting pipeline:
# Note: this should be changed for a proper Logging mechanism.
start_time = time.time()
print('Message="Start of pipeline"')

# Fetch files to be processed
datasource0 = glueContext.create_dynamic_frame_from_options(connection_type="s3",
                                                               connection_options={"paths": [glue_path], "exclusions" :  "[\"s3://rd-dl-pa-107495021244/raw/" + job_directory + "/_part*\"]"},
                                                               format="json",
                                                               compression="gzip",
                                                               transformation_ctx = "datasource0")
                                                               
print('Message="Start of processing"')

# Create a new dataFrame from Relationalize
#print('Message="Select Json results"')
#input_df = dfc.select(dfc_root_table_name)

print('Message="Count records"')
recordCount = datasource0.count()
metritcs_read = json.dumps({'glue_job_metrics': glue_job, 'directory': job_directory, 'records': recordCount, 'action': 'reading_s3'})
print(metritcs_read)

if recordCount != 0:
    # Test create more paritions for improved performance 
    dynamicFrame1 = datasource0.repartition(200)
    # Flatten json nested dict
    print('Message="Flattern Json"')
    dfc = Relationalize.apply(frame = dynamicFrame1, staging_path = glue_temp_storage, name = dfc_root_table_name, transformation_ctx = "dfc", totalThreshold=1)

    # Convert Dynamic frame collection to Dynamic frame 
    df0 = dfc.select(dfc_root_table_name)
    # Convert Dynamic frame to Data Frame
    df1 = df0.toDF().repartition(200)
    
    # Remove the "jsonBody." from each column name
    df2 = df1.toDF(*(c.replace('jsonBody.', '') for c in df1.columns))

    # Remove all the double quotes from values
    df3 = df2
    quote_replace_str = "df2"
    for df_col in df2.columns:
        try:
            df3 = df3.withColumn(df_col, regexp_replace(df_col, '"', ''))
        except:
            print('Failed to process df column {0}'.format(df_col))
    
    # Turn it back to a dynamic frame
    df4 = DynamicFrame.fromDF(df3, glueContext, "df_dynamicFrame")
    
    # Apply mapping
    df5 = df4.apply_mapping([("CLUSTER_NAME","string","CLUSTER_NAME","string"),
("SUBMIT_TIME_GMT","string","SUBMIT_TIME_GMT","timestamp"),
("START_TIME_GMT","string","START_TIME_GMT","timestamp"),
("FINISH_TIME_GMT","string","FINISH_TIME_GMT","timestamp"),
("SUBMIT_TIME","string","SUBMIT_TIME","timestamp"),
("START_TIME","string","START_TIME","timestamp"),
("FINISH_TIME","string","FINISH_TIME","timestamp"),
("FINISH_ISO_WEEK","string","FINISH_ISO_WEEK","string"),
("PROJECT_NAME","string","PROJECT_NAME","string"),
("QUEUE_NAME","string","QUEUE_NAME","string"),
("USER_GROUP","string","USER_GROUP","string"),
("USER_NAME","string","USER_NAME","string"),
("JOB_TYPE","string","JOB_TYPE","string"),
("JOB_GROUP","string","JOB_GROUP","string"),
("SLA_TAG","string","SLA_TAG","string"),
("RES_REQ","string","RES_REQ","string"),
("MEM_REQ","string","MEM_REQ","decimal(10,0)"),
("SUBMISSION_HOST","string","SUBMISSION_HOST","string"),
("EXEC_HOSTNAME","string","EXEC_HOSTNAME","string"),
("EXEC_HOSTTYPE","string","EXEC_HOSTTYPE","string"),
("EXEC_HOSTMODEL","string","EXEC_HOSTMODEL","string"),
("EXEC_HOSTGROUP","string","EXEC_HOSTGROUP","string"),
("NUM_EXEC_PROCS","string","NUM_EXEC_PROCS","decimal(15,0)"),
("NUMBER_OF_JOBS","string","NUMBER_OF_JOBS","decimal(19,4)"),
("NUM_SLOTS","string","NUM_SLOTS","decimal(10,0)"),
("JOB_EXIT_STATUS","string","JOB_EXIT_STATUS","string"),
("JOB_EXIT_CODE","string","JOB_EXIT_CODE","decimal(10,0)"),
("APPLICATION_NAME","string","APPLICATION_NAME","string"),
("JOB_ID","string","JOB_ID","decimal(15,0)"),
("JOB_ARRAY_INDEX","string","JOB_ARRAY_INDEX","decimal(15,0)"),
("JOB_NAME","string","JOB_NAME","string"),
("JOB_CMD","string","JOB_CMD","string"),
("JOB_PEND_TIME","string","JOB_PEND_TIME","decimal(19,4)"),
("JOB_RUN_TIME","string","JOB_RUN_TIME","decimal(19,4)"),
("JOB_TURNAROUND_TIME","string","JOB_TURNAROUND_TIME","decimal(19,4)"),
("JOB_MEM_USAGE","string","JOB_MEM_USAGE","decimal(19,4)"),
("JOB_SWAP_USAGE","string","JOB_SWAP_USAGE","decimal(19,4)"),
("JOB_CPU_TIME","string","JOB_CPU_TIME","decimal(19,4)"),
("PEND_TIME","string","PEND_TIME","decimal(19,4)"),
("RUN_TIME","string","RUN_TIME","decimal(19,4)"),
("TURNAROUND_TIME","string","TURNAROUND_TIME","decimal(19,4)"),
("MEM_USAGE","string","MEM_USAGE","decimal(19,4)"),
("SWAP_USAGE","string","SWAP_USAGE","decimal(19,4)"),
("CPU_TIME","string","CPU_TIME","decimal(19,4)"),
("RANK_MEM","string","RANK_MEM","string"),
("RANK_MEM_REQ","string","RANK_MEM_REQ","string"),
("RANK_RUNTIME","string","RANK_RUNTIME","string"),
("RANK_PENDTIME","string","RANK_PENDTIME","string"),
("RANK_CPUTIME","string","RANK_CPUTIME","string"),
("RANK_EFFICIENCY","string","RANK_EFFICIENCY","string"),
("JOB_GROUP1","string","JOB_GROUP1","string"),
("JOB_GROUP2","string","JOB_GROUP2","string"),
("JOB_GROUP3","string","JOB_GROUP3","string"),
("JOB_GROUP4","string","JOB_GROUP4","string"),
("CLUSTER_MAPPING","string","CLUSTER_MAPPING","string"),
("PROJECT_MAPPING","string","PROJECT_MAPPING","string"),
("USER_MAPPING","string","USER_MAPPING","string"),
("JOB_DESCRIPTION","string","JOB_DESCRIPTION","string"),
("USERNAME_MAP1","string","USERNAME_MAP1","string"),
("USERNAME_MAP2","string","USERNAME_MAP2","string"),
("USERNAME_MAP3","string","USERNAME_MAP3","string"),
("USERNAME_MAP4","string","USERNAME_MAP4","string"),
("PROJECTNAME_MAP1","string","PROJECTNAME_MAP1","string"),
("PROJECTNAME_MAP2","string","PROJECTNAME_MAP2","string"),
("PROJECTNAME_MAP3","string","PROJECTNAME_MAP3","string"),
("EXIT_REASON","string","EXIT_REASON","string"),
("RUN_LIMIT","string","RUN_LIMIT","decimal(13,0)"),
("BEGIN_TIME","string","BEGIN_TIME","timestamp"),
("DEPEND_COND","string","DEPEND_COND","string")])

    # Convert to df
    df6 = df5.toDF().repartition(200)

    # Partition by year/month/day
    df7 = df6 \
        .withColumn("year", year(col(partition_column))) \
        .withColumn("month", month(col(partition_column))) \
        .withColumn("day", dayofmonth(col(partition_column)))

    print('Message="End of processing", ProcesingTime={0}'.format(time.time() - start_time))
    # Prepare for writing to s3
    df8 = df7.repartition("year", "month", "day")

    # Convert back to a DynamicFrame for further processing.
    partitioned_dynamicframe = DynamicFrame.fromDF(df8, glueContext, "partitioned_df")

    # Write data to s3
    datasink1 = glueContext.write_dynamic_frame.from_options(frame = partitioned_dynamicframe, connection_type = "s3", connection_options = {"path": glue_relationalize_output_s3_path, "partitionKeys": ["year","month", "day"]}, format = "parquet", transformation_ctx = "datasink1")    
    print('Message="End of pipeline", ProcesingTime={0}'.format(time.time() - start_time))

    metritcs_write = json.dumps({'glue_job_metrics': glue_job, 'directory': job_directory, 'records': partitioned_dynamicframe.count(), 'action': 'writing_s3'})
    print(metritcs_write)
job.commit()