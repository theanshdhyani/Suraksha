import crypto from 'node:crypto';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import type { ServiceMode } from '../core/types';
import type { NotificationProvider, ProviderHealthReport } from './interfaces';

export class MockNotificationProvider implements NotificationProvider {
  public readonly id = 'amazon_sns';
  public readonly name = 'MockNotificationProvider (Simulated Amazon SNS)';

  public getMode(): ServiceMode {
    return 'MOCK';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    return {
      id: this.id,
      name: this.name,
      mode: 'MOCK',
      status: 'MOCK',
      detail: 'Simulated Amazon SNS guardian push/SMS delivery ready.',
      checked_at: new Date().toISOString(),
    };
  }

  public async sendGuardianAlert(input: {
    alert_id: string;
    guardian_name: string;
    subject: string;
    message: string;
  }) {
    return {
      provider: this.name,
      mode: 'MOCK' as const,
      delivery_status: 'SIMULATED_DELIVERED' as const,
      external_message_id: `sns_sim_${crypto.randomUUID().slice(0, 12)}`,
    };
  }
}

export class AmazonSNSProvider implements NotificationProvider {
  public readonly id = 'amazon_sns';
  public readonly name = 'AmazonSNSProvider (AWS SNS Topic)';

  public getMode(): ServiceMode {
    return 'LIVE';
  }

  public async healthCheck(): Promise<ProviderHealthReport> {
    const region = process.env.AWS_REGION?.trim();
    const topicArn = process.env.SNS_TOPIC_ARN?.trim();
    const checked_at = new Date().toISOString();

    if (!region || !topicArn) {
      return {
        id: this.id,
        name: this.name,
        mode: 'LIVE',
        status: 'PENDING CONFIGURATION',
        detail: 'Missing AWS_REGION or SNS_TOPIC_ARN.',
        checked_at,
      };
    }

    return {
      id: this.id,
      name: this.name,
      mode: 'LIVE',
      status: 'LIVE',
      detail: `Configured for SNS topic "${topicArn}".`,
      checked_at,
    };
  }

  public async sendGuardianAlert(input: {
    alert_id: string;
    guardian_name: string;
    subject: string;
    message: string;
  }) {
    const region = process.env.AWS_REGION?.trim();
    const topicArn = process.env.SNS_TOPIC_ARN?.trim();
    if (!region || !topicArn) {
      throw new Error('Amazon SNS LIVE mode requires AWS_REGION and SNS_TOPIC_ARN.');
    }

    const client = new SNSClient({ region });
    const result = await client.send(
      new PublishCommand({
        TopicArn: topicArn,
        Subject: input.subject.slice(0, 100),
        Message: input.message,
      })
    );

    return {
      provider: this.name,
      mode: 'LIVE' as const,
      delivery_status: 'DELIVERED' as const,
      external_message_id: result.MessageId || `sns_${Date.now()}`,
    };
  }
}
