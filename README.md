# Faultline

Faultline tests whether an industrial AI action is still justified when it is about to execute, not merely when it was proposed.

Faultline is a change-aware assurance boundary for industrial AI actions. It compiles declared engineering inputs into deterministic Plant Contracts, binds proposed actions and permits to that basis, rejects relevant stale authority before dispatch, operates only against a synthetic deterministic simulator, and records outcomes through readback and reconciliation.

> The Faultline reference implementation operates against simulated processes. It does not authorize or perform physical plant control and is not a process-safety certification system.

```text
ENGINEERING != EVIDENCE != REASONING != ADMISSIBILITY != AUTHORITY
            != ORCHESTRATION != EXECUTION != VERIFICATION
```

## 90-second demo

```bash
pnpm install
pnpm build
pnpm test
pnpm demo
pnpm case:verify
pnpm check:refund
pnpm replay:refund
```

The demo proves two narrow invariants:

1. R17 permits are rejected before dispatch after R18 changes the cooling dependency.
2. A synthetic simulator effect that survives lost acknowledgement is reconciled without a second dispatch; its effect count remains one.

The result names are intentionally limited to `MODEL_ACCEPTS_WITHIN_DOMAIN`, `MODEL_REJECTS`, and `MODEL_INCONCLUSIVE`. They are model results, not physical-safety claims. Each result records the synthetic adapter/version plus digests of its initial state and requested operation.

`pnpm demo` writes the deterministic synthetic bundle at `case-bundles/cstr-walking-skeleton.case.json`. Inspect it with `pnpm exec tsx apps/cli/src/index.ts case inspect`.

The CLI also supports `pnpm exec tsx apps/cli/src/index.ts compile fixtures/cstr/engineering/R17.json`, `... contract inspect R17`, `... diff R17 R18`, `... demo stale-permit`, `... demo ambiguous-completion`, `... check examples/refund`, and `... replay failures/FL-0001.json`. The compile and diff commands parse the declared JSON fixture; `R17` and `R18` are merely path shorthands.

## Why authority becomes stale

An approval is not valid forever. The R17 scenario authorizes one exact feed-controller setpoint under an R17 cooling-capacity basis. R18 changes that basis. Its declared dependency impact intersects the permit, so pre-dispatch validation returns `REQUIRES_REEVALUATION / ENGINEERING_BASIS_CHANGED` and the simulator is not called.

The second scenario applies a synthetic effect and loses its acknowledgement. Faultline does not infer either success or failure: it marks completion unknown, reads back the operation-ID ledger, and suppresses redispatch when the effect already exists.

## Architecture

```text
Engineering sources -> Plant Contract -> evidence -> deterministic proposal
       -> admissibility -> authority -> revision-bound permit -> workflow
       -> pre-dispatch revalidation -> bounded executor -> simulator
       -> readback / reconciliation -> case bundle
```

## Systematic counterexamples

Faultline also contains a bounded, deterministic explorer for a synthetic refund workflow. Rather than requiring a hand-authored failure trace, it enumerates scheduler choices—dispatch, supersession, crash/restart, response loss, readback, and bounded retry behavior—then checks **Authority-Effect Linearizability (AEL)** after each transition.

```text
execution IR -> deterministic scheduler -> AEL checker
                                           |
                                           v
                                  shortest counterexample
                                           |
                                           v
                                  JSON replay capsule
```

The included `refund-stale-approval` model intentionally represents an unsafe worker. The explorer discovers a stale R17 effect after R18 is current, shrinks it to three transitions, writes `failures/FL-0001.json`, and reproduces it with `faultline replay`. The response-loss and cross-tenant-resume reference scenarios must remain violation-free within their published bounds.

This is exhaustive only within the checked-in model and explicit depth/state bounds; it is not a proof about production commerce systems, providers, or arbitrary workflows. [Read the AEL model and bounds.](docs/systematic-counterexamples.md)

## Public evidence

| Surface                 | What can be inspected here                                                                                                                                                                                                               |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engineering             | Checked-in synthetic R17/R18 declarations compile into immutable, SHA-256-addressed Plant Contracts with source, node, provenance, dependency, and monitor records.                                                                      |
| Revision semantics      | A change-impact artifact names the exact before/after contract digests. Dispatch accepts it only when it matches both the permit and current contract.                                                                                   |
| Authority and execution | A permit binds one operation, evidence snapshot, dependency closure, approval lifetime, and contract basis. The executor accepts only the simulator-adapter port.                                                                        |
| Recovery                | The deterministic acknowledgement-loss case records its receipt, unknown-completion state, reconciliation, readback, and final outcome.                                                                                                  |
| Replay                  | The versioned case bundle verifies artifact digests, cross-artifact references, event IDs, workflow states, and simulator provenance. Digest verification detects modification; it does not establish an external identity or signature. |
| Systematic exploration  | A bounded BFS explores a typed synthetic execution model, checks six AEL invariants, shrinks discovered violations, and replays a JSON counterexample capsule.                                                                           |

The repository contains deterministic unit, contract, integration, and adversarial tests for these paths. The public reference workflow store is in memory: it demonstrates explicit load/save and legal resume transitions, but it is not a production durable-host adapter.

## What Faultline is not

Faultline is not a DCS, PLC runtime, SIS, autonomous plant operator, process-safety certification system, universal simulator, digital-twin platform, full DEXPI implementation, or replacement for engineering review. There is no live plant actuation code in this repository.

## Design lineage

Faultline grew out of reliability patterns developed while building Vertex, a private commerce intelligence and execution platform. It independently generalizes evidence, authority, durable-work, generation-fencing, and reconciliation ideas into industrial-native semantics: compiled engineering contracts, revision dependency tracking, and revision-bound permits. It has no Vertex dependency or infrastructure requirement.

## Deeper reading

- [Architecture](docs/architecture.md)
- [Semantics](docs/semantics.md)
- [Trust boundaries](docs/trust-boundaries.md)
- [R17 to R18 demo](docs/r17-r18-demo.md)
- [Crash recovery demo](docs/crash-recovery-demo.md)
- [Systematic Counterexamples](docs/systematic-counterexamples.md)
- [Non-goals](docs/non-goals.md)
- [Roadmap](docs/roadmap.md)
