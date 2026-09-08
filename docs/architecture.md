# Architecture

Faultline keeps the statement of engineering intent separate from what was observed, proposed, permitted, dispatched, and later verified. The reference path is in-process and simulator-only.

```text
ENGINEERING != EVIDENCE != REASONING != ADMISSIBILITY
            != AUTHORITY != ORCHESTRATION != EXECUTION != VERIFICATION

approved engineering sources
        -> Plant Contract compiler -> immutable Plant Contract
plant evidence -> deterministic proposal -> admissibility -> revision-bound permit
        -> workflow -> pre-dispatch revalidation -> bounded executor -> simulator
        -> readback / reconciliation -> replayable case bundle

engineering revision -> contract diff -> declared dependency impact -> reevaluate affected authority
```

The package boundaries express this direction: `contracts` holds only shared vocabulary; `plant-ir` and `plant-contract` establish engineering truth; `evidence` and `proposal` do not issue authority; `authority` issues a narrow permit only after admissibility; `workflow` coordinates state; `executor` can call only the synthetic simulator; and `case-bundle` records rather than decides policy.

The deterministic CSTR is intentionally a small model, not an industrial process model. Its only job in this foundation is to make dispatch, lost acknowledgement, readback, and operation-ID reconciliation observable.
