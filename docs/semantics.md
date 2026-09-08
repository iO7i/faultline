# Semantics

Plant Contracts are immutable, content-addressed artifacts compiled only from approved engineering sources. They retain source revisions, node digests, dependency graph entries, provenance links, and the small runtime-monitor set used by the CSTR fixture.

Evidence preserves epistemic class, quality, generation, measurement time, and ingestion time. A snapshot is a digest-bound selection of evidence; its freshness is evaluated independently of engineering validity.

Admissibility has exactly three results: `ADMISSIBLE_WITHIN_DECLARED_MODEL`, `REJECTED`, and `INSUFFICIENT_EVIDENCE`. These describe the declared model and evidence, never physical safety.

A permit binds one principal, approval, plant, unit, asset, purpose, operation digest, logical operation ID, engineering generation, contract digest, dependency closure, and evidence snapshot. It is not a plant credential or a broad future capability.

At dispatch, expired evidence, changed arguments, or a changed/uncertain dependency basis require reevaluation. An acknowledgement is not an outcome: Faultline records intended, dispatched, acknowledged, and observed states separately, then reconciles ambiguous completion against simulator readback.
