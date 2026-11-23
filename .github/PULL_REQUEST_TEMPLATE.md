## Summary

<!-- Describe what this PR changes and why -->

## Safety & Architecture Checklist

- [ ] No AI/automated voice reply directed at the suspected caller
- [ ] Deterministic rule engine triggers without waiting on an LLM
- [ ] Tier 2 `family_mcp` tools remain gated by explicit `"haan"` signed tokens + Cedar `PERMIT`
- [ ] `npm run lint`, `npm test`, and `npm run build` pass locally
