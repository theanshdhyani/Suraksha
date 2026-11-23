import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { ServiceMode } from '../core/types';
import type { AuditStorageProvider, ProviderHealthReport } from './interfaces';

export class LocalAuditStorageProvider implements AuditStorageProvider {
  public readonly id = 'dynamodb';
  public readonly name = 'LocalAuditStorageProvider (Persistent SHA-256 Store)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Persistent local SHA-256 hash-chained audit ledger active (data/audit-log.json).',
      checked_at: new Date().toISOString(),
    };
  }

  public async mirrorAuditEvent(): Promise<{ mirrored: boolean; target: string }> {
    return { mirrored: true, target: 'local:data/audit-log.json' };
  }

  public async storeEvidenceObject(evidenceId: string): Promise<{ stored: boolean; target: string }> {
    return { stored: true, target: `local:evidence/${evidenceId}.json` };
  }
}

export class AwsDynamoS3AuditProvider implements AuditStorageProvider {
  public readonly id = 'dynamodb';
  public readonly name = 'AwsDynamoS3AuditProvider (DynamoDB + S3 Object Lock)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const region = process.env.AWS_REGION?.trim();
    const table = process.env.DYNAMODB_TABLE_NAME?.trim();
    const bucket = process.env.S3_AUDIT_BUCKET?.trim();
    const checked_at = new Date().toISOString();

    if (!region || (!table && !bucket)) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing AWS_REGION and DYNAMODB_TABLE_NAME / S3_AUDIT_BUCKET.',
        checked_at,
      };
    }

    return {
      id: this.id,
      name: this.name,
      mode: 'LIVE',
      status: 'LIVE',
      detail: `Configured for DynamoDB="${table || 'unset'}" and S3 Object Lock="${bucket || 'unset'}".`,
      checked_at,
    };
  }

  public async mirrorAuditEvent(event: Record<string, unknown>) {
    const region = process.env.AWS_REGION?.trim();
    const tableName = process.env.DYNAMODB_TABLE_NAME?.trim();
    if (!region || !tableName) {
      return { mirrored: false, target: 'dynamodb:unconfigured' };
    }
    const client = new DynamoDBClient({ region });
    await client.send(
      new PutItemCommand({
        TableName: tableName,
        Item: {
          alert_id: { S: String(event.alert_id || 'unknown') },
          seq: { N: String(event.seq || 0) },
          event_id: { S: String(event.event_id || '') },
          timestamp: { S: String(event.timestamp || '') },
          event_hash: { S: String(event.event_hash || '') },
          previous_event_hash: { S: String(event.previous_event_hash || '') },
          payload_json: { S: JSON.stringify(event) },
        },
        ConditionExpression: 'attribute_not_exists(event_id)',
      })
    );
    return { mirrored: true, target: `dynamodb:${tableName}` };
  }

  public async storeEvidenceObject(evidenceId: string, bodyJson: string) {
    const region = process.env.AWS_REGION?.trim();
    const bucket = process.env.S3_AUDIT_BUCKET?.trim();
    if (!region || !bucket) {
      return { stored: false, target: 's3:unconfigured' };
    }
    const client = new S3Client({ region });
    const retainUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: `evidence/${evidenceId}.json`,
        Body: bodyJson,
        ContentType: 'application/json',
        ObjectLockMode: 'COMPLIANCE',
        ObjectLockRetainUntilDate: retainUntil,
      })
    );
    return { stored: true, target: `s3://${bucket}/evidence/${evidenceId}.json` };
  }
}
