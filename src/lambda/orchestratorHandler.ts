/**
 * AWS Lambda Deployment Adapter — Orchestrator Lambda
 * Ready for deployment behind API Gateway / Scribe WebSocket event stream.
 * Reuses the exact same SurakshaOrchestrator business logic as local DEMO MODE.
 */
import { SurakshaOrchestrator } from '../services/orchestrator';

let sharedOrchestrator: SurakshaOrchestrator | null = null;

function getOrchestrator(): SurakshaOrchestrator {
  if (!sharedOrchestrator) {
    sharedOrchestrator = new SurakshaOrchestrator({
      // In AWS Lambda, persistent audit uses DynamoDB + S3 Object Lock via AwsDynamoS3AuditProvider
      auditPersistPath: '/tmp/suraksha-audit-cache.json',
    });
  }
  return sharedOrchestrator;
}

export interface LambdaHttpEvent {
  httpMethod?: string;
  path?: string;
  body?: string | null;
}

export async function handler(event: LambdaHttpEvent) {
  const orchestrator = getOrchestrator();
  const payload = event.body ? JSON.parse(event.body) : {};

  if (event.path?.endsWith('/transcript') && event.httpMethod === 'POST') {
    const res = await orchestrator.ingestTranscriptSegment(payload);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(res),
    };
  }

  if (event.path?.endsWith('/approval') && event.httpMethod === 'POST') {
    const res = await orchestrator.submitParentalResponse(payload);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(res),
    };
  }

  return {
    statusCode: 400,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ error: 'Unsupported Orchestrator Lambda route.' }),
  };
}
