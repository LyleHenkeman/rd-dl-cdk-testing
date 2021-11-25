import * as cdk from "@aws-cdk/core";
import { Role } from "@aws-cdk/aws-iam";
export declare class BlogGlueWorkFlowStack extends cdk.Stack {
    readonly glueRole: Role;
    constructor(scope: cdk.App, id: string, props?: cdk.StackProps);
}
export interface RedshiftVpcStackProps extends cdk.StackProps {
    glueRoleGrantSecretRead: Role;
}
