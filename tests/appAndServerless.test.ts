import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { createSurakshaApp } from '../src/serverApp';
import { SurakshaOrchestrator } from '../src/services/orchestrator';
import { handler as netlifyHandler } from '../netlify/functions/api';

async function withTestServer(
  fn: (baseUrl: string) => Promise<void>
): Promise<void> {
  const orch = new SurakshaOrchestrator({ auditPersistPath: null });
  const { app } = createSurakshaApp(orch);
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') {
    server.close();
    throw new Error('Failed to bind ephemeral port');
  }
  const baseUrl = `http://127.0.0.1:${addr.port}`;
  try {
    await fn(baseUrl);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('createSurakshaApp serves health, Cedar policy, isolated URL check, and validates integration IDs', async () => {
  await withTestServer(async (baseUrl) => {
    const healthResp = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthResp.status, 200);
    const healthJson = (await healthResp.json()) as { status: string; service: string };
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.service, 'SURAKSHA');

    const toolsResp = await fetch(`${baseUrl}/api/gateway/tools`);
    assert.equal(toolsResp.status, 200);
    const toolsJson = (await toolsResp.json()) as { tools: unknown[]; cedar_policy: string };
    assert.ok(toolsJson.tools.length >= 6);
    assert.ok(toolsJson.cedar_policy.includes('cedar') || toolsJson.cedar_policy.includes('forbid'));

    const badModeResp = await fetch(`${baseUrl}/api/integrations/unknown_service/mode`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'LIVE' }),
    });
    assert.equal(badModeResp.status, 400);

    const drillResp = await fetch(`${baseUrl}/api/drill/check-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'https://sbi-kyc-update-verify.xyz/login' }),
    });
    assert.equal(drillResp.status, 200);
    const drillJson = (await drillResp.json()) as { never_opened_links: boolean; url_checks: Array<{ verdict: string }> };
    assert.equal(drillJson.never_opened_links, true);
    assert.equal(drillJson.url_checks[0]?.verdict, 'MALICIOUS');
  });
});

test('Netlify serverless API handler routes both /api/* and /.netlify/functions/api/* requests cleanly', async () => {
  const prevNetlify = process.env.NETLIFY;
  process.env.NETLIFY = 'true';
  try {
    const directRes = (await netlifyHandler(
      {
        httpMethod: 'GET',
        path: '/api/health',
        headers: {},
        queryStringParameters: {},
        body: null,
        isBase64Encoded: false,
      },
      {}
    )) as { statusCode: number; body: string };

    assert.equal(directRes.statusCode, 200);
    const directJson = JSON.parse(directRes.body) as { status: string; service: string };
    assert.equal(directJson.status, 'ok');
    assert.equal(directJson.service, 'SURAKSHA');

    const rewrittenRes = (await netlifyHandler(
      {
        httpMethod: 'GET',
        path: '/.netlify/functions/api/dashboard',
        headers: {},
        queryStringParameters: {},
        body: null,
        isBase64Encoded: false,
      },
      {}
    )) as { statusCode: number; body: string };

    assert.equal(rewrittenRes.statusCode, 200);
    const dashJson = JSON.parse(rewrittenRes.body) as { protection_active: boolean; audit_chain_valid: boolean };
    assert.equal(dashJson.protection_active, true);
    assert.equal(dashJson.audit_chain_valid, true);
  } finally {
    if (prevNetlify === undefined) {
      delete process.env.NETLIFY;
    } else {
      process.env.NETLIFY = prevNetlify;
    }
  }
});
