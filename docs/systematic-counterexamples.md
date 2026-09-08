# Systematic counterexamples

Faultline's systematic counterexample engine explores a small, deterministic execution model instead of waiting for a test author to choose one ordering of workers, authority changes, crashes, and external effects.

It is a bounded model explorer, not a claim of formal verification or a model of production providers.

## Authority-Effect Linearizability

An external effect is legal only when it can be associated with an authority point that admits that exact consequential operation at the moment the effect commits.

```text
proposal -> authorization -> dispatch -> external effect -> readback -> receipt
```

The question is intentionally narrower than general agent behavior: **did a concrete effect have current authority for its exact scope and arguments when it committed?**

The engine evaluates six executable invariants:

| Invariant                           | Executable question                                                                         |
| ----------------------------------- | ------------------------------------------------------------------------------------------- |
| I1 — no effect without authority    | Does the effect name an authority for its exact logical operation and action?               |
| I2 — approval binds exact arguments | Does the effect's argument hash equal the authority-bound argument hash?                    |
| I3 — stale authority cannot commit  | Did the authority revision equal the current revision at the time of commit?                |
| I4 — logical effect at most once    | Did one logical operation produce more than one committed effect?                           |
| I5 — tenant/principal cannot drift  | Does the effect remain inside the authority-bound tenant and principal scope?               |
| I6 — committed effect is accounted  | At quiescence, is the effect receipt/readback/reconciled evidence or explicitly `IN_DOUBT`? |

An authority that was current when an effect committed is not retroactively invalidated by a later supersession. I3 records the current authority revision at commit time to preserve that distinction.

## Execution IR and scheduler

The typed IR records logical time, logical operation, principal, tenant, action/argument hash, authority revision, effect identity, worker identity, and a compact event trace. It includes proposal, authority, dispatch, effect, response, readback, receipt, crash, restart, tenant-drift, and retry-suppression events.

The scheduler owns the ordering. Its current fault primitives are authority supersession, worker crash/restart, response loss, and resumed tenant-context drift. There are no OS threads, provider clients, wall-clock time, or live model decisions in this layer.

```text
initial state
    -> enumerate enabled transitions in stable order
    -> apply one transition
    -> check AEL
    -> deduplicate equivalent state
    -> continue within depth/state bounds
```

The implementation uses breadth-first search so the first discovered violation is already short. It also applies a small deletion-based shrinker before serializing the trace. Partial-order reduction is intentionally deferred until the project has measured state growth and read/write footprints.

## Included synthetic scenarios

`examples/refund/faultline-model.json` selects three deterministic scenarios.

| Scenario                | Expected bounded result                                                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `refund-stale-approval` | An intentionally unsafe worker allows a R17 refund effect after R18 is current. The engine must find `I3_STALE_AUTHORITY_CANNOT_COMMIT`. |
| `commit-response-lost`  | A lost response produces `IN_DOUBT` or readback evidence; repeated work does not create another logical effect.                          |
| `cross-tenant-resume`   | A resumed worker with tenant-B runtime context is rejected before it can create tenant-A's effect.                                       |

Run and replay the public capsule:

```bash
pnpm check:refund
pnpm replay:refund
```

The emitted `failures/FL-0001.json` contains only synthetic identifiers, logical transition IDs, and the minimized event trace. It can be replayed deterministically by the same model version.

## Bounds and non-claims

Search is exhaustive only for the selected model, enabled transitions, and stated `maxDepth` / `maxStates` bounds. A state cutoff is reported rather than interpreted as success. A passing scenario means no AEL violation was found within those bounds; it does not establish correctness of a different model, integration, provider, production workflow, or physical process.

The engine currently excludes DPOR, distributed workers, databases, real financial operations, provider credentials, LLM calls, dashboards, and cloud execution by design.
