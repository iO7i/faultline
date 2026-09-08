import { ids } from '../../../packages/contracts/src/index.js';
import {
  compareContracts,
  compilePlantContract,
  InMemoryPlantContractRegistry,
} from '../../../packages/plant-contract/src/index.js';
import { makeSource, type PlantIR } from '../../../packages/plant-ir/src/index.js';
import { InMemoryEvidenceStore } from '../../../packages/evidence/src/index.js';
import { evaluateAdmissibility } from '../../../packages/admissibility/src/index.js';
import { authorize } from '../../../packages/authority/src/index.js';
import { DeterministicCstrSimulator } from '../../../packages/simulator/src/index.js';
import { executeBounded, reconcile, reconcileOutcome } from '../../../packages/executor/src/index.js';
import { createCaseBundle } from '../../../packages/case-bundle/src/index.js';
const now = '2026-01-01T00:00:00.000Z';
export const compileDemoGeneration = (generation: 'R17' | 'R18') => {
  const g = ids.generation(generation);
  const cooling = makeSource({
    sourceId: ids.source('cooling-capacity'),
    revision: ids.revision(generation),
    kind: 'OPERATING_ENVELOPE',
    scope: 'Unit-RX',
    approval: { status: 'APPROVED' },
  });
  const ir: PlantIR = {
    plantId: ids.plant('DemoPlant-01'),
    unitId: ids.unit('Unit-RX'),
    generation: g,
    nodes: [
      {
        assetId: ids.asset('FIC-101'),
        type: 'CONTROL_TARGET',
        scope: 'Unit-RX',
        sourceIds: [cooling.sourceId],
        generation: g,
        actuatable: true,
        dimension: 'MassFlow',
      },
      {
        assetId: ids.asset('CoolingSystem-CS1'),
        type: 'EQUIPMENT',
        scope: 'Unit-RX',
        sourceIds: [cooling.sourceId],
        generation: g,
      },
    ],
    edges: [{ from: ids.asset('CoolingSystem-CS1'), to: ids.asset('FIC-101'), kind: 'COOLING_DEPENDENCY' }],
  };
  const result = compilePlantContract({
    ir,
    sources: [cooling],
    capabilities: [
      {
        id: ids.capability('process.feed.adjust'),
        version: '1',
        target: ids.asset('FIC-101'),
        allowedMode: 'NORMAL',
        dependencies: [ids.asset('CoolingSystem-CS1')],
      },
    ],
    constraints: [
      {
        id: 'CoolingAvailable',
        kind: 'ARGUMENT_BOUND',
        capabilityId: ids.capability('process.feed.adjust'),
        target: ids.asset('FIC-101'),
        max: { value: generation === 'R17' ? 124 : 110, unit: 'kg/s' },
        sourceId: cooling.sourceId,
      },
    ],
  });
  if (!result.ok) throw new Error('compile failed');
  return { g, contract: result.contract };
};
export const runDemos = () => {
  const r17 = compileDemoGeneration('R17');
  const r18 = compileDemoGeneration('R18');
  const store = new InMemoryEvidenceStore();
  store.append({
    evidenceId: ids.evidence('e-1'),
    plantId: ids.plant('DemoPlant-01'),
    assetId: 'TT-204',
    generation: r17.g,
    measuredAt: now,
    ingestedAt: now,
    source: 'synthetic',
    sourceRevision: '1',
    class: 'SIMULATED',
    quality: 'GOOD',
    value: { value: 82, unit: 'degC' },
  });
  const snapshot = store.snapshot(r17.g, now, 60000);
  const intent = {
    logicalOperationId: ids.operation('op-001'),
    proposalId: ids.proposal('proposal-1'),
    plantId: ids.plant('DemoPlant-01'),
    unitId: ids.unit('Unit-RX'),
    targetAssetId: ids.asset('FIC-101'),
    engineeringGeneration: r17.g,
    capabilityId: ids.capability('process.feed.adjust'),
    purpose: 'cooling-constrained-feed-adjust',
    operation: {
      kind: 'SETPOINT_CHANGE' as const,
      target: ids.asset('FIC-101'),
      value: { value: 124, unit: 'kg/s' as const },
    },
    evidenceSnapshotId: snapshot.snapshotId,
  };
  const admissibility = evaluateAdmissibility(r17.contract, snapshot, intent);
  const authority = authorize(
    { id: 'operator-1', kind: 'HUMAN' },
    {
      id: ids.approval('approval-1'),
      expiresAt: '2026-01-01T01:00:00.000Z',
      plantId: 'DemoPlant-01',
      unitId: 'Unit-RX',
      assetId: ids.asset('FIC-101'),
      capabilityId: 'process.feed.adjust',
      purpose: intent.purpose,
    },
    admissibility,
    intent,
    now,
  );
  if (authority.status !== 'ADMIT') throw new Error('authority denied');
  const registry = new InMemoryPlantContractRegistry();
  registry.put(r17.contract);
  registry.put(r18.contract);
  registry.advance(r17.g);
  registry.advance(r18.g);
  const impact = compareContracts(r17.contract, r18.contract, [
    { permitId: authority.permit.permitId, dependencyClosure: authority.permit.dependencyClosure },
  ]);
  const stale = executeBounded(
    authority.permit,
    intent,
    r18.g,
    new DeterministicCstrSimulator(),
    now,
    impact.affectedPermits.includes(authority.permit.permitId) ? 'AFFECTED' : 'UNCERTAIN',
  );
  const recoveryIntent = {
    ...intent,
    logicalOperationId: ids.operation('op-002'),
    proposalId: ids.proposal('proposal-2'),
  };
  const recoveryAdmissibility = evaluateAdmissibility(r17.contract, snapshot, recoveryIntent);
  const recoveryAuthority = authorize(
    { id: 'operator-1', kind: 'HUMAN' },
    {
      id: ids.approval('approval-2'),
      expiresAt: '2026-01-01T01:00:00.000Z',
      plantId: 'DemoPlant-01',
      unitId: 'Unit-RX',
      assetId: ids.asset('FIC-101'),
      capabilityId: 'process.feed.adjust',
      purpose: recoveryIntent.purpose,
    },
    recoveryAdmissibility,
    recoveryIntent,
    now,
  );
  if (recoveryAuthority.status !== 'ADMIT') throw new Error('recovery authority denied');
  const simulator = new DeterministicCstrSimulator();
  simulator.injectAcknowledgementLoss();
  const unknown = executeBounded(
    recoveryAuthority.permit,
    recoveryIntent,
    r17.g,
    simulator,
    now,
    'UNAFFECTED',
  );
  const recovered = reconcile(recoveryIntent, simulator);
  const outcome = reconcileOutcome(recoveryIntent, simulator);
  return {
    r17,
    r18,
    snapshot,
    intent,
    permit: authority.permit,
    recoveryIntent,
    recoveryPermit: recoveryAuthority.permit,
    impact,
    stale,
    unknown,
    recovered,
    outcome,
    readback: simulator.readback(),
    effectCount: simulator.effectCount(recoveryIntent.logicalOperationId),
  };
};

export const createWalkingSkeletonBundle = () => {
  const result = runDemos();
  return createCaseBundle(ids.caseBundle('cstr-walking-skeleton'), {
    schemaVersion: 'faultline.case-bundle.v1',
    recordedAt: now,
    engineering: { r17: result.r17.contract, r18: result.r18.contract },
    evidenceSnapshot: result.snapshot,
    intendedAction: result.intent,
    revisionBoundPermit: result.permit,
    changeImpact: result.impact,
    stalePermitOutcome: result.stale,
    ambiguousCompletion: {
      intendedAction: result.recoveryIntent,
      revisionBoundPermit: result.recoveryPermit,
      dispatch: 'SENT',
      acknowledgement: 'LOST',
      workflow: result.unknown,
      observedReadback: result.readback,
      reconciliation: result.recovered,
      outcome: result.outcome,
    },
  });
};
