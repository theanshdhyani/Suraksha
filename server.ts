import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { renderEvidencePackHtmlReport } from './src/core/evidencePack';
import { PREDEFINED_SCENARIOS } from './src/core/scenarios';
import type { ServiceMode } from './src/core/types';
import { INTEGRATION_DESCRIPTORS, type IntegrationKey } from './src/providers/config';
import { generateLocalChimeWavBuffer } from './src/providers/tts';
import { SurakshaOrchestrator } from './src/services/orchestrator';
import {
  analyzeSuspiciousMessageAndLinks,
  SCAM_DRILL_SCENARIOS,
} from './src/services/scamDrillService';

export function createSurakshaApp(orchestrator = new SurakshaOrchestrator()) {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  // Ensure Gateway MCP servers are initialized eagerly
  void orchestrator.gateway.init();

  // --------------------------------------------------------------------------
  // Health & Integration Status
  // --------------------------------------------------------------------------
  app.get('/api/health', async (_req, res) => {
    const integrations = orchestrator.providers.getIntegrationStatuses();
    res.json({
      status: 'ok',
      service: 'SURAKSHA',
      timestamp: new Date().toISOString(),
      integrations,
    });
  });

  app.get('/api/integrations', async (req, res) => {
    const probe = req.query.probe === 'true';
    const items = probe
      ? await orchestrator.providers.runAllHealthChecks()
      : orchestrator.providers.getIntegrationStatuses();
    res.json({ integrations: items });
  });

  app.post('/api/integrations/:id/mode', async (req, res) => {
    const id = req.params.id as IntegrationKey;
    if (!INTEGRATION_DESCRIPTORS.some((d) => d.id === id)) {
      res.status(400).json({ error: `Unknown integration id: ${req.params.id}` });
      return;
    }
    const mode = String(req.body?.mode || '').toUpperCase() as ServiceMode;
    if (mode !== 'MOCK' && mode !== 'LIVE') {
      res.status(400).json({ error: 'mode must be MOCK or LIVE' });
      return;
    }
    orchestrator.providers.setServiceMode(id, mode);
    const items = await orchestrator.providers.runAllHealthChecks();
    res.json({ integrations: items });
  });

  // --------------------------------------------------------------------------
  // Dashboard & Scenarios
  // --------------------------------------------------------------------------
  app.get('/api/dashboard', (_req, res) => {
    res.json(orchestrator.getDashboardSummary());
  });

  app.get('/api/scenarios', (_req, res) => {
    res.json({ scenarios: PREDEFINED_SCENARIOS });
  });

  // --------------------------------------------------------------------------
  // Live Guard Sessions & Progressive Transcript Ingestion
  // --------------------------------------------------------------------------
  app.get('/api/sessions', (_req, res) => {
    res.json({ sessions: orchestrator.listSessions() });
  });

  app.post('/api/sessions', (req, res) => {
    const session = orchestrator.startSession({
      scenario_id: req.body?.scenario_id,
      caller_label: req.body?.caller_label,
      caller_number: req.body?.caller_number,
      parent_name: req.body?.parent_name,
      guardian_name: req.body?.guardian_name,
    });
    res.status(201).json({ session });
  });

  app.post('/api/sessions/:sessionId/echo-suppression', (req, res) => {
    const active = Boolean(req.body?.active);
    const session = orchestrator.setEchoSuppression(req.params.sessionId, active);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }
    res.json({ session });
  });

  app.post('/api/sessions/:sessionId/transcript', async (req, res) => {
    try {
      const text = String(req.body?.text || '').trim();
      const speaker = req.body?.speaker === 'PARENT' ? 'PARENT' : 'CALLER';
      if (!text) {
        res.status(400).json({ error: 'Transcript text is required' });
        return;
      }
      const result = await orchestrator.ingestTranscriptSegment({
        session_id: req.params.sessionId,
        speaker,
        text,
        language: req.body?.language,
        timestamp_ms: req.body?.timestamp_ms,
        is_partial: req.body?.is_partial,
      });
      res.json(result);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Failed to ingest segment' });
    }
  });

  // --------------------------------------------------------------------------
  // Consented Family Voice Audio Clip (Local DEMO WAV)
  // --------------------------------------------------------------------------
  app.get('/api/tts/prompt-audio', (_req, res) => {
    const wav = generateLocalChimeWavBuffer();
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Content-Length', String(wav.length));
    res.send(wav);
  });

  // --------------------------------------------------------------------------
  // Alerts & Explicit Parental "haan" Approval Flow
  // --------------------------------------------------------------------------
  app.get('/api/alerts', (_req, res) => {
    res.json({ alerts: orchestrator.listAlerts() });
  });

  app.get('/api/alerts/:alertId', (req, res) => {
    const alert = orchestrator.getAlert(req.params.alertId);
    if (!alert) {
      res.status(404).json({ error: 'Alert not found' });
      return;
    }
    res.json({ alert });
  });

  app.post('/api/alerts/:alertId/approval', async (req, res) => {
    try {
      const utterance = String(req.body?.utterance || '').trim();
      const approver_id = String(req.body?.approver_id || 'parent-primary');
      if (!utterance) {
        res.status(400).json({ error: 'Parent utterance is required.' });
        return;
      }
      const result = await orchestrator.submitParentalResponse({
        alert_id: req.params.alertId,
        utterance,
        approver_id,
      });
      res.json(result);
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Approval error' });
    }
  });

  // --------------------------------------------------------------------------
  // AgentCore Gateway & Policy Enforcement (Demonstrates Blocked & Allowed)
  // --------------------------------------------------------------------------
  app.get('/api/gateway/tools', async (_req, res) => {
    const tools = await orchestrator.gateway.listRegisteredTools();
    const cedarPath = path.resolve(process.cwd(), 'policies/suraksha.cedar');
    const cedarPolicyText = fs.existsSync(cedarPath) ? fs.readFileSync(cedarPath, 'utf-8') : '';
    res.json({ tools, cedar_policy: cedarPolicyText });
  });

  app.post('/api/gateway/test-unauthorized', async (req, res) => {
    const alert_id = String(req.body?.alert_id || '').trim();
    const scenario = String(req.body?.scenario || 'MISSING_TOKEN');
    const validScenarios = new Set([
      'MISSING_TOKEN',
      'REUSED_TOKEN',
      'LLM_OVERRIDE',
      'WRONG_ALERT_ID',
      'FORBIDDEN_SCAMMER_REPLY',
    ]);
    if (!alert_id) {
      res.status(400).json({ error: 'alert_id is required' });
      return;
    }
    if (!validScenarios.has(scenario)) {
      res.status(400).json({ error: `Invalid gateway test scenario: ${scenario}` });
      return;
    }
    const result = await orchestrator.testUnauthorizedGatewayCall({
      alert_id,
      scenario: scenario as
        | 'MISSING_TOKEN'
        | 'REUSED_TOKEN'
        | 'LLM_OVERRIDE'
        | 'WRONG_ALERT_ID'
        | 'FORBIDDEN_SCAMMER_REPLY',
    });
    res.json(result);
  });

  // --------------------------------------------------------------------------
  // Evidence Center & Hash-Chained Audit Log (Append-Only)
  // --------------------------------------------------------------------------
  app.get('/api/evidence', (_req, res) => {
    res.json({ evidence_packs: orchestrator.listEvidencePacks() });
  });

  app.get('/api/evidence/:alertId/download', (req, res) => {
    const pack = orchestrator.getEvidencePack(req.params.alertId);
    if (!pack) {
      res.status(404).json({ error: 'Evidence pack not found for this alert.' });
      return;
    }
    const format = String(req.query.format || 'json').toLowerCase();
    if (format === 'html') {
      const html = renderEvidencePackHtmlReport(pack);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="suraksha-evidence-${pack.alert_id}.html"`
      );
      res.send(html);
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="suraksha-evidence-${pack.alert_id}.json"`
    );
    res.send(JSON.stringify(pack, null, 2));
  });

  app.get('/api/audit', (_req, res) => {
    res.json({
      events: orchestrator.auditLog.list().reverse(),
      verification: orchestrator.auditLog.verifyIntegrity(),
    });
  });

  app.get('/api/audit/verify', (_req, res) => {
    res.json(orchestrator.auditLog.verifyIntegrity());
  });

  // --------------------------------------------------------------------------
  // Isolated Scam Drill & Secondary Message/URL Check (Never touches Live Guard)
  // --------------------------------------------------------------------------
  app.get('/api/drill/scenarios', (_req, res) => {
    res.json({
      isolated_from_live_call: true,
      scenarios: SCAM_DRILL_SCENARIOS,
    });
  });

  app.post('/api/drill/check-message', (req, res) => {
    const messageText = typeof req.body?.messageText === 'string' ? req.body.messageText : '';
    const url = typeof req.body?.url === 'string' ? req.body.url : '';
    if (!messageText.trim() && !url.trim()) {
      res.status(400).json({ error: 'Provide a suspicious message or URL to inspect.' });
      return;
    }
    const result = analyzeSuspiciousMessageAndLinks({ messageText, url });
    res.json(result);
  });

  return { app, orchestrator };
}

async function startServer() {
  const { app } = createSurakshaApp();
  const port = Number(process.env.PORT || 3000);
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`SURAKSHA server listening on http://localhost:${port}`);
  });
}

// Only start HTTP listener when executed as entrypoint
const isEntry =
  process.argv[1] &&
  (process.argv[1].endsWith('server.ts') || process.argv[1].endsWith('server.js'));

if (isEntry) {
  void startServer();
}
