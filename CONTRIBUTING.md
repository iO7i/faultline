# Contributing to Faultline

Faultline is a deterministic, simulator-only reference implementation for revision-bound authority, stale-action rejection, and reconciliation in industrial AI workflows.

## Find a useful slice

Start with the [v0.3 Brownfield Reference Path](https://github.com/iO7i/faultline/issues/4) and its linked sub-issues. Read the issue acceptance criteria and dependencies before starting. Claim an issue by commenting with your intended approach; ask maintainers to assign it if you need ownership recorded. If an issue is too broad or blocked, say so rather than opening an unrelated implementation thread.

For substantial changes to package boundaries, workflow semantics, authority, persistence, or industrial adapters, discuss the design on the issue before implementing it. Small fixtures, documentation, development tooling, and isolated adapters can usually proceed directly when their issue is clear.

## Preserve the assurance boundary

The repository deliberately keeps these distinctions intact:

- AI reasoning produces proposals; it does not issue authority or dispatch operations.
- Approval is not permanent authority.
- Dispatch is not confirmed effect.
- Engineering revision at proposal time is not engineering revision at effect time.
- OPC-UA or any industrial gateway must remain behind Faultline's authority and effect boundary.
- Simulators model process behavior; they do not grant permits or decide policy.
- Engineering-source adapters remain outside the assurance kernel.

A change that weakens one of these properties needs an explicit design discussion and focused adversarial tests.

## Synthetic and public data only

The v0.3 reference environment is a fictionalized Saudi/Jubail polyethylene plant inspired by the class of real brownfield petrochemical environments. It is not a digital twin of UNITED, SABIC, or any other facility.

All tags, identifiers, operating limits, P&IDs, process topology, control logic, engineering revisions, telemetry, screenshots, and process parameters added to the reference path must be synthetic or derived from public/general industrial knowledge. Do not contribute confidential, proprietary, remembered, copied, or reverse-engineered plant information. If provenance is unclear, stop and ask before adding it.

Reference data must be labeled as synthetic and must not be presented as an engineering-grade operating limit, safety claim, or live-plant procedure.

## Tests and pull requests

Install the locked dependencies and run the checks relevant to your change:

```bash
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm lint
pnpm format:check
```

Preserve the existing deterministic demos, replay artifacts, and adversarial tests. A pull request should:

- stay focused on one issue or a clearly related slice;
- explain the boundary or invariant it preserves;
- include tests for behavior changes and failure paths;
- update documentation or fixtures when the contributor-facing contract changes; and
- state any assumptions, synthetic-data provenance, and follow-up work.

Do not connect the repository to a live plant or external OT system as part of a contribution. Faultline is not a DCS, PLC runtime, SIS, autonomous plant operator, process-safety certification system, or replacement for engineering review.