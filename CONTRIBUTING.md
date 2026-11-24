# Contributing to SURAKSHA

Thank you for checking out **SURAKSHA**! Whether you are evaluating the project at **wHACKiest 2026** or extending detection rules, MCP tools, or live adapters, follow these guidelines so the safety guarantees remain intact.

## Non-Negotiable Architecture Rules

Every pull request must preserve SURAKSHA's core safety invariants:

1. **Never talk to the suspected scammer:** Do not add any conversational AI or automated reply path directed at the incoming caller.
2. **Deterministic detection first:** High-risk scam alerts and consented voice interruptions (`src/core/ruleEngine.ts`) must never wait on or depend on an LLM call.
3. **LLM outside authorization:** Amazon Bedrock or any LLM adapter must never mint approval tokens or bypass `CedarPolicyEngine` (`policies/suraksha.cedar`).
4. **Tier 2 requires explicit `"haan"`:** `family_mcp` tools must always require a signed, unexpired, unused, alert-bound HMAC-SHA256 token validated by `GatewayInterceptor` + Cedar `PERMIT`.
5. **Append-only audit trail:** Never expose `update` or `delete` operations on `audit_mcp`.
6. **Manual cybercrime reporting only:** Evidence Packs must preserve `EVIDENCE READY – MANUAL FAMILY SUBMISSION REQUIRED` for Chakshu, `1930`, and `cybercrime.gov.in`.

## Extending SURAKSHA

- **Add Scam Detection Rules:** Edit `src/core/ruleEngine.ts` and add positive + negative baseline test cases in `tests/ruleEngine.test.ts`.
- **Add Scam Playbooks or Offline URL Rules:** Edit `src/core/scamIntelligence.ts` (never perform live network fetches of untrusted URLs).
- **Wire a Live Provider:** Implement the corresponding interface in `src/providers/interfaces.ts` and register it in `src/providers/factory.ts`, maintaining graceful `PENDING CONFIGURATION` when env vars are unset.

## Local Verification Checklist

Before committing changes, verify all checks pass:

```bash
npm run lint    # Strict TypeScript check
npm test        # 17 deterministic unit, Cedar, MCP, audit, serverless & E2E tests
npm run build   # Vite production build
```
