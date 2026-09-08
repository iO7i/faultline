# R17 to R18 stale-authority demonstration

R17 compiles an approved cooling-capacity source and admits the exact synthetic action `set FIC-101 to 124 kg/s`. Authority issues a permit bound to R17 and the declared cooling dependency.

Before dispatch, R18 changes the same source revision and tightens the recorded argument bound. Contract comparison identifies the changed engineering source, `CoolingAvailable`, and `process.feed.adjust`; the pending permit's declared closure intersects that change.

The comparison artifact records both the R17 and R18 contract digests. Pre-dispatch validation returns `REQUIRES_REEVALUATION / ENGINEERING_BASIS_CHANGED`; the executor does not call the simulator. A missing, uncertain, or differently paired comparison artifact instead returns `DEPENDENCY_IMPACT_UNKNOWN`. This is conservative invalidation: unproven dependency coverage is never treated as unaffected.
