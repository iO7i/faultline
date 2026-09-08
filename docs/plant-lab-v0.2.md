# Plant Lab v0.2: replayable P-101 incident

Plant Lab v0.2 is a small, local reference experiment. It models one normalized P-101 pump command, one authority revision race, two execution policies, and three revision-arrival timings. It is not a process controller, digital twin, plant certification artifact, or source of engineering operating limits.

The flagship fixture starts P-101 at `0.40`. R17 permits `0.70` against a declared normalized maximum of `0.80`. R18 changes the declared maximum to `0.55`; the valid fresh R18 operation is therefore `0.50`. These are synthetic normalized values only.

The experiment creates a serializable checkpoint after R17 approval and before R18 arrives. It hydrates two independent copies from that checkpoint:

```text
checkpoint
  ├── approval-only
  └── revalidate-at-effect-boundary
```

Both branches receive the same R18 event and queued operation. In `approval-only`, P-101 applies `0.70` using R17 while R18 is current; the unchanged AEL checker identifies the resulting I3 evidence. In the guarded branch, the authority reread and simulated P-101 commit are one deterministic transition. The R17 work is rejected before an effect exists; a new R18 `0.50` operation can then complete normally. Later success never rewrites the original branch.

The browser and `pnpm plant-lab:replay [capsule.json]` share the same pure controller. Exported capsules contain the configuration, checkpoint, independent branches, evidence, and a canonical semantic digest. Import/replay validates the digest and recomputes AEL outcomes instead of trusting stored display strings.

> The browser simulator models authority revalidation and effect commit as one deterministic transition. This demonstrates the intended correctness boundary; it does not establish atomicity for arbitrary distributed services or physical controllers.
