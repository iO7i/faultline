# Synthetic refund workflow

This model is a deterministic, simulator-only execution model for systematic exploration. It represents consequential refund-like effects with synthetic tenants, principals, order references, and amounts; it has no provider adapter, financial integration, customer data, or real authorization service.

`refund-stale-approval` intentionally models a faulty worker that commits after its R17 authority is superseded by R18. Faultline should discover `I3_STALE_AUTHORITY_CANNOT_COMMIT`, shrink the trace, and emit a replay capsule. The other two scenarios represent safe reference behavior for response loss and cross-tenant resume.

Run it with:

```bash
pnpm exec tsx apps/cli/src/index.ts check examples/refund
```
