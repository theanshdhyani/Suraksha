# SURAKSHA — AWS Deployment Prerequisites & Architecture Guide

## 1. AWS Infrastructure Prerequisites (For LIVE MODE Deployment)

1. **Amazon Cognito**:
   - Create a Cognito User Pool (`COGNITO_USER_POOL_ID`) and App Client (`COGNITO_CLIENT_ID`).
   - Configure OAuth scopes for parent-approved session claims (`suraksha/family.alert`).
2. **Amazon Bedrock**:
   - Enable model access in `AWS_REGION` (e.g., `anthropic.claude-3-5-sonnet-20241022-v2:0` or `amazon.nova-pro-v1:0`).
   - Set `BEDROCK_MODEL_ID`. Bedrock is restricted strictly to advisory risk explanation and Hindi scripts.
3. **AWS Lambda (Orchestrator & Gateway Interceptor)**:
   - Deploy `src/lambda/orchestratorHandler.ts` as the Orchestrator Lambda.
   - Deploy `src/lambda/gatewayInterceptor.ts` as the Bedrock AgentCore Gateway Request Interceptor Lambda.
   - Store `APPROVAL_SIGNING_SECRET` in AWS Secrets Manager / KMS-encrypted environment config.
4. **Amazon Bedrock AgentCore Gateway & Cedar Policies**:
   - Provision an AgentCore Gateway (`AGENTCORE_GATEWAY_URL`) with Cognito JWT authorizer.
   - Attach `policies/suraksha.cedar` to the Gateway Policy Engine (Default-Deny + Forbid-Wins).
   - Register the 4 MCP Server targets behind the Gateway (`listen_mcp`, `scam_intel_mcp`, `family_mcp`, `audit_mcp`).
5. **Amazon SNS**:
   - Create an SNS Topic (`SNS_TOPIC_ARN`) and subscribe guardian endpoints (SMS / Mobile Push / Email).
6. **Amazon DynamoDB & S3 Object Lock**:
   - Create DynamoDB table (`DYNAMODB_TABLE_NAME`) with partition key `alert_id` (String) and sort key `seq` (Number) for hash-chained audit events.
   - Create an S3 bucket (`S3_AUDIT_BUCKET`) with **Object Lock enabled** (`COMPLIANCE` mode) for immutable Evidence Packs.

## 2. IAM Least-Privilege Summary

- **Orchestrator Lambda Role**: `bedrock:InvokeModel` (scoped to `BEDROCK_MODEL_ID`), `bedrock-agentcore:InvokeGateway`. No direct `sns:Publish` (must go through Gateway -> Family MCP).
- **Family MCP Target Role**: `sns:Publish` scoped strictly to `SNS_TOPIC_ARN`.
- **Audit MCP Target Role**: `dynamodb:PutItem` only (no `UpdateItem` or `DeleteItem` permissions!), `s3:PutObject` + `s3:PutObjectRetention` on `S3_AUDIT_BUCKET`.
