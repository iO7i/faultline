# Trust boundaries

```text
WRONG  AI -> simulator directly
RIGHT  AI -> proposal -> admissibility -> authority -> permit -> executor -> simulator

WRONG  draft engineering -> authoritative contract
RIGHT  approved engineering -> compiler -> immutable contract

WRONG  simulation passes -> physically safe
RIGHT  simulation -> model result under recorded assumptions

WRONG  approval -> valid indefinitely
RIGHT  approval -> narrow, expiring, revision-bound permit

WRONG  retry -> repeat operation
RIGHT  logical operation -> reconcile before redispatch

WRONG  missing required evidence -> pass
RIGHT  missing required evidence -> INSUFFICIENT_EVIDENCE
```

The deterministic fixture reasoner may recommend an exact operation. It may not modify engineering declarations, issue permits, bypass a contract gate, or receive an executor/simulator capability. Future adapters stay behind interfaces and do not change these semantics.
