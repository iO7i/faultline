import {
  digest,
  type EngineeringGenerationId,
  type EvidenceId,
  type EvidenceSnapshotDigest,
  type EvidenceSnapshotId,
  type PlantId,
} from '../../contracts/src/index.js';
import type { Quantity } from '../../plant-ir/src/index.js';
export type EvidenceClass =
  'MEASURED' | 'OPERATOR_REPORTED' | 'CALCULATED' | 'MODEL_ESTIMATE' | 'MODEL_FORECAST' | 'SIMULATED';
export type EvidenceQuality = 'GOOD' | 'UNCERTAIN' | 'BAD' | 'STALE' | 'MISSING' | 'OUT_OF_DOMAIN';
export type Evidence = {
  evidenceId: EvidenceId;
  plantId: PlantId;
  assetId: string;
  generation: EngineeringGenerationId;
  measuredAt: string;
  ingestedAt: string;
  source: string;
  sourceRevision: string;
  class: EvidenceClass;
  quality: EvidenceQuality;
  value: Quantity;
};
export type EvidenceSnapshot = {
  snapshotId: EvidenceSnapshotId;
  digest: EvidenceSnapshotDigest;
  createdAt: string;
  generation: EngineeringGenerationId;
  evidence: readonly Evidence[];
  fresh: boolean;
};
export class InMemoryEvidenceStore {
  #items: Evidence[] = [];
  append(e: Evidence) {
    this.#items.push(structuredClone(e));
  }
  snapshot(generation: EngineeringGenerationId, now: string, maxAgeMs: number): EvidenceSnapshot {
    const evidence = this.#items
      .filter((e) => e.generation === generation)
      .sort((a, b) => a.evidenceId.localeCompare(b.evidenceId))
      .map((e) => structuredClone(e));
    const fresh =
      evidence.length > 0 &&
      evidence.every((e) => e.quality === 'GOOD' && Date.parse(now) - Date.parse(e.measuredAt) <= maxAgeMs);
    const base = { createdAt: now, generation, evidence, fresh };
    return {
      ...base,
      snapshotId: `snapshot:${digest(base).slice(0, 16)}` as EvidenceSnapshotId,
      digest: digest(base) as EvidenceSnapshotDigest,
    };
  }
}
