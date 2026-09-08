# Semantics

Plant Contracts are immutable, content-addressed artifacts compiled only from approved engineering sources. They retain source revisions, node digests, dependency graph entries, provenance links, and the small runtime-monitor set used by the CSTR fixture. Compilation rejects duplicate source identities, unresolved topology, incomplete argument/dependency declarations, unapproved sources, and dimensional disagreement.

Evidence preserves epistemic class, quality, generation, measurement time, and ingestion time. A snapshot is a digest-bound selection of evidence; its freshness is evaluated independently of engineering validity.

Admissibility has exactly three results: `ADMISSIBLE_WITHIN_DECLARED_MODEL`, `REJECTED`, and `INSUFFICIENT_EVIDENCE`. These describe the declared model and evidence, never physical safety.

A permit binds one principal, approval, plant, unit, asset, purpose, operation digest, logical operation ID, engineering generation, contract digest, dependency closure, and evidence snapshot. It is not a plant credential or a broad future capability. Dispatch first confirms that the permit's own operation and dependency-closure digests are internally consistent.

Contract comparison returns an impact artifact bound to its exact before/after contract digests and declares whether coverage is complete. At dispatch, a missing, uncertain, or wrongly paired impact artifact requires reevaluation; it cannot certify an unrelated contract transition as unaffected. Expired evidence, changed evidence snapshots, changed arguments, and expired permits also require reevaluation or rejection according to the binding failure.

An acknowledgement is not an outcome: Faultline records intended, dispatched, acknowledged, and observed states separately, then reconciles ambiguous completion against simulator readback. Simulator counterfactuals and receipts carry adapter/version and operation/state digests; the versioned case verifier requires those references to agree. Case-bundle digests detect modification of recorded artifacts but are not signatures or proof of origin.
