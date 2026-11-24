import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { IntegrationStatusItem } from '../core/types';
import type { RegisteredToolInfo } from '../mcp/gatewayRouter';

type NodeGroup =
  | 'DETECTION'
  | 'ORCHESTRATION'
  | 'POLICY'
  | 'MCP'
  | 'EXTERNAL'
  | 'HUMAN_HANDOFF'
  | 'AWS_OUTPUT';

interface ArchNode {
  id: string;
  label: string;
  subtitle: string;
  group: NodeGroup;
  integrationId?: string;
}

const ARCH_GROUPS: Array<{
  title: string;
  group: NodeGroup;
  nodes: ArchNode[];
}> = [
  {
    title: 'External Audio & Voice Layer',
    group: 'EXTERNAL',
    nodes: [
      {
        id: 'scribe',
        label: 'ElevenLabs Scribe v2',
        subtitle: 'WebSocket Real-time STT · Hindi/Hinglish',
        group: 'EXTERNAL',
        integrationId: 'elevenlabs_scribe',
      },
      {
        id: 'tts',
        label: 'ElevenLabs TTS',
        subtitle: 'Consented Family Voice · Echo Suppression',
        group: 'EXTERNAL',
        integrationId: 'elevenlabs_tts',
      },
    ],
  },
  {
    title: 'Detection Layer (Amber)',
    group: 'DETECTION',
    nodes: [
      {
        id: 'rule-engine',
        label: 'Rule Engine',
        subtitle: 'Deterministic 18s Rolling Window · 6 Categories',
        group: 'DETECTION',
      },
      {
        id: 'bedrock',
        label: 'Amazon Bedrock',
        subtitle: 'Advisory Hindi/Hinglish Explanation Only',
        group: 'DETECTION',
        integrationId: 'amazon_bedrock',
      },
    ],
  },
  {
    title: 'Orchestration & Approval (Blue)',
    group: 'ORCHESTRATION',
    nodes: [
      {
        id: 'orchestrator',
        label: 'Orchestrator Lambda',
        subtitle: 'Alert Lifecycle · Independent Interruption',
        group: 'ORCHESTRATION',
      },
      {
        id: 'approval',
        label: 'Approval Service',
        subtitle: 'Explicit "haan" · HMAC-SHA256 Single-Use Token',
        group: 'ORCHESTRATION',
      },
    ],
  },
  {
    title: 'Policy Enforcement Layer (Red)',
    group: 'POLICY',
    nodes: [
      {
        id: 'gateway',
        label: 'AgentCore Gateway',
        subtitle: 'Mandatory MCP Perimeter Proxy',
        group: 'POLICY',
        integrationId: 'agentcore_gateway',
      },
      {
        id: 'cognito',
        label: 'Cognito OAuth',
        subtitle: 'Principal & JWT Scope Binding',
        group: 'POLICY',
        integrationId: 'aws_cognito',
      },
      {
        id: 'interceptor',
        label: 'Lambda Interceptor',
        subtitle: 'Signature, TTL, Alert ID & Replay Check',
        group: 'POLICY',
      },
      {
        id: 'cedar',
        label: 'Cedar Policy',
        subtitle: 'Default-Deny · Forbid-Wins Outside LLM',
        group: 'POLICY',
      },
    ],
  },
  {
    title: 'MCP Server Layer — Make MCP Matter (Green)',
    group: 'MCP',
    nodes: [
      {
        id: 'listen-mcp',
        label: 'Listen MCP',
        subtitle: 'Tier 1 · get_transcript_window',
        group: 'MCP',
      },
      {
        id: 'scam-intel-mcp',
        label: 'Scam-Intel MCP',
        subtitle: 'Tier 1 · match_scam_playbook, score_signals, check_url, prepare_evidence_pack',
        group: 'MCP',
      },
      {
        id: 'family-mcp',
        label: 'Family MCP',
        subtitle: 'Tier 2 (Approval Locked) · alert_guardians, send_family_voice_message',
        group: 'MCP',
      },
      {
        id: 'audit-mcp',
        label: 'Audit MCP',
        subtitle: 'Append-Only · append_event (No Update/Delete)',
        group: 'MCP',
      },
    ],
  },
  {
    title: 'Notification & AWS Storage Outputs (Neutral)',
    group: 'AWS_OUTPUT',
    nodes: [
      {
        id: 'sns',
        label: 'Amazon SNS',
        subtitle: 'Guardian Push/SMS Notification',
        group: 'AWS_OUTPUT',
        integrationId: 'amazon_sns',
      },
      {
        id: 'dynamodb',
        label: 'DynamoDB',
        subtitle: 'Hash-Chained Audit Ledger',
        group: 'AWS_OUTPUT',
        integrationId: 'dynamodb',
      },
      {
        id: 's3-lock',
        label: 'S3 Object Lock',
        subtitle: 'COMPLIANCE Retention Evidence Store',
        group: 'AWS_OUTPUT',
        integrationId: 's3_object_lock',
      },
      {
        id: 'guardian-dash',
        label: 'Guardian Dashboard',
        subtitle: 'Real-Time Incident & Policy Visibility',
        group: 'AWS_OUTPUT',
      },
    ],
  },
  {
    title: 'Human Handoff — Manual Reporting Only (Dashed Orange)',
    group: 'HUMAN_HANDOFF',
    nodes: [
      {
        id: 'evidence-pack',
        label: 'Evidence Pack',
        subtitle: 'Chakshu · 1930 · cybercrime.gov.in (No Auto-Submit)',
        group: 'HUMAN_HANDOFF',
      },
    ],
  },
];

const GROUP_STYLES: Record<NodeGroup, string> = {
  DETECTION: 'bg-amber-50 border-amber-400 text-amber-950',
  ORCHESTRATION: 'bg-blue-50 border-blue-400 text-blue-950',
  POLICY: 'bg-red-50 border-red-400 text-red-950',
  MCP: 'bg-emerald-50 border-emerald-400 text-emerald-950',
  EXTERNAL: 'bg-slate-100 border-slate-400 text-slate-900',
  HUMAN_HANDOFF: 'bg-orange-50 border-2 border-dashed border-orange-500 text-orange-950',
  AWS_OUTPUT: 'bg-white border-slate-300 text-slate-900',
};

export function ArchitectureMonitor() {
  const [tools, setTools] = useState<RegisteredToolInfo[]>([]);
  const [cedarPolicy, setCedarPolicy] = useState('');
  const [integrations, setIntegrations] = useState<IntegrationStatusItem[]>([]);
  const [activeLayer, setActiveLayer] = useState<NodeGroup | 'ALL'>('ALL');

  useEffect(() => {
    void Promise.all([api.getGatewayTools(), api.getIntegrations()])
      .then(([g, i]) => {
        setTools(g.tools);
        setCedarPolicy(g.cedar_policy);
        setIntegrations(i.integrations);
      })
      .catch(() => {});
  }, []);

  const statusFor = (integrationId?: string) => {
    if (!integrationId) return 'ACTIVE';
    const found = integrations.find((i) => i.id === integrationId);
    return found ? found.status : 'MOCK';
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Architecture Monitor</h1>
          <p className="text-xs text-slate-500 mt-1">
            End-to-end SURAKSHA execution topology · Strictly isolates suspected caller from AI &amp;
            gates Family MCP behind AgentCore Gateway
          </p>
        </div>

        {/* Color Legend */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(
            [
              ['ALL', 'All Layers'],
              ['DETECTION', 'Detection (Amber)'],
              ['ORCHESTRATION', 'Orchestration (Blue)'],
              ['POLICY', 'Policy (Red)'],
              ['MCP', 'MCP Servers (Green)'],
              ['EXTERNAL', 'External (Grey)'],
              ['HUMAN_HANDOFF', 'Human Handoff (Dashed Orange)'],
              ['AWS_OUTPUT', 'AWS Outputs (Neutral)'],
            ] as Array<[NodeGroup | 'ALL', string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveLayer(key)}
              className={`px-2.5 py-1.5 rounded-md border text-xs font-medium cursor-pointer transition-colors ${
                activeLayer === key
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Architecture Layers */}
      <div className="space-y-5">
        {ARCH_GROUPS.filter((g) => activeLayer === 'ALL' || g.group === activeLayer).map((layer) => (
          <section key={layer.title} className="bg-white border border-slate-200 rounded-xl p-5">
            <h2 className="text-xs font-semibold text-slate-600 mb-3">{layer.title}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {layer.nodes.map((node) => (
                <div
                  key={node.id}
                  className={`rounded-lg border p-3.5 flex flex-col justify-between gap-2 ${GROUP_STYLES[node.group]}`}
                >
                  <div>
                    <div className="text-sm font-semibold">{node.label}</div>
                    <p className="text-xs opacity-85 mt-0.5">{node.subtitle}</p>
                  </div>
                  <div className="text-[11px] font-mono opacity-80 pt-2 border-t border-black/10">
                    State: {statusFor(node.integrationId)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Real MCP Server Registry & Cedar Policy */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Registered MCP Tools Behind AgentCore Gateway ({tools.length} tools)
          </h2>
          <div className="divide-y divide-slate-100 text-xs">
            {tools.map((t) => (
              <div key={`${t.server}-${t.name}`} className="py-2.5 flex items-start justify-between gap-3">
                <div>
                  <div className="font-mono font-semibold text-slate-900">
                    {t.server} :: {t.name}
                  </div>
                  <div className="text-slate-500 mt-0.5">{t.description}</div>
                </div>
                <span
                  className={`font-mono font-semibold shrink-0 ${
                    t.tier === 'TIER_2'
                      ? 'text-red-600'
                      : t.tier === 'AUDIT'
                        ? 'text-blue-700'
                        : 'text-emerald-700'
                  }`}
                >
                  {t.tier}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-slate-200 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">
            Active Cedar Policy Specification (policies/suraksha.cedar)
          </h2>
          <pre className="bg-slate-950 text-slate-100 rounded-lg p-4 text-[11px] font-mono overflow-x-auto max-h-[340px] leading-relaxed">
            {cedarPolicy || 'Loading Cedar policy…'}
          </pre>
        </section>
      </div>
    </div>
  );
}
