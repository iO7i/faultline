import { canonicalize, digest } from '../../../packages/contracts/src/index.js';
import {
  checkAel,
  type AelState,
  type AelViolation,
  type Authority,
  type Effect,
  type ExecutionEvent,
  type ExecutionEventType,
  type SyntheticRefundOperation,
  type Worker,
} from '../../../packages/counterexample/src/index.js';
import { createInitialPlantState, stepPlant, type PlantState } from './plant/model.js';

/**
 * The numbers in this fixture are normalized demonstration values, not pump
 * operating limits. The controller owns these limits; AEL only judges the
 * resulting authority/effect history.
 */
export type RevisionTiming = 'before-approval' | 'after-approval-before-effect' | 'after-valid-effect';
export type ExecutionPolicy = 'approval-only' | 'revalidate-at-effect-boundary';
export type RevisionId = 'R17' | 'R18';
export type IncidentLane = 'proposal-authority' | 'execution' | 'observation-faultline';

export type PlantIncidentExperiment = Readonly<{
  scenarioVersion: 'faultline.plant-incident.v0.2';
  equipmentId: 'P-101';
  initialCommand: number;
  proposedCommand: number;
  revisedCommand: number;
  revisionTiming: RevisionTiming;
  revisions: Readonly<{ R17: Readonly<{ maxCommand: number }>; R18: Readonly<{ maxCommand: number }> }>;
}>;

export type PumpOperation = Readonly<{
  operationId: string;
  action: 'pump.command.set';
  target: 'P-101';
  arguments: Readonly<{ command: number }>;
  authorityRevision: RevisionId;
}>;

export type IncidentEvent = Readonly<{
  eventId: string;
  logicalTime: number;
  lane: IncidentLane;
  kind:
    | 'ProposalCreated'
    | 'AuthorityGranted'
    | 'AuthoritySuperseded'
    | 'DispatchStarted'
    | 'EffectCommitted'
    | 'ReadbackObserved'
    | 'ExecutionRejectedStale'
    | 'FaultlineFinding';
  equipmentId: 'P-101';
  operationId: string | null;
  revision: RevisionId | null;
  currentRevisionAtCommit: RevisionId | null;
  command: number | null;
  effectId: string | null;
  detail: string;
}>;

export type IncidentBranch = Readonly<{
  branchId: ExecutionPolicy;
  checkpointId: string;
  policy: ExecutionPolicy;
  plant: PlantState;
  currentRevision: RevisionId;
  pendingOperation: PumpOperation | null;
  operations: readonly PumpOperation[];
  events: readonly IncidentEvent[];
  aelEvents: readonly ExecutionEvent[];
  effects: readonly Readonly<{
    effectId: string;
    operation: PumpOperation;
    authorityRevision: RevisionId;
    currentRevisionAtCommit: RevisionId;
  }>[];
  violation: AelViolation | null;
  status: 'waiting' | 'rejected-stale' | 'pass' | 'violation';
}>;

export type IncidentCheckpoint = Readonly<{
  checkpointId: string;
  logicalTime: number;
  experiment: PlantIncidentExperiment;
  plant: PlantState;
  currentRevision: RevisionId;
  pendingOperation: PumpOperation;
  prefixEvents: readonly IncidentEvent[];
  prefixAelEvents: readonly ExecutionEvent[];
}>;

export type IncidentSession = Readonly<{
  experiment: PlantIncidentExperiment;
  checkpoint: IncidentCheckpoint;
  approvalOnly: IncidentBranch;
  revalidateAtEffectBoundary: IncidentBranch;
  revisedProposalApproved: boolean;
}>;

export type PlantIncidentCapsule = Readonly<{
  schemaVersion: 'faultline.plant-incident-capsule.v1';
  plantModelVersion: 'normalized-ro-v0.1';
  experiment: PlantIncidentExperiment;
  checkpoint: IncidentCheckpoint;
  branches: Readonly<{ approvalOnly: IncidentBranch; revalidateAtEffectBoundary: IncidentBranch }>;
  revisedProposalApproved: boolean;
  semanticDigest: string;
  presentation?: Readonly<{ camera?: Readonly<{ alpha: number; beta: number; radius: number }> }>;
}>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const revisionNumber = (revision: RevisionId): number => (revision === 'R17' ? 17 : 18);
const canAuthorize = (experiment: PlantIncidentExperiment, revision: RevisionId, command: number): boolean =>
  command <= experiment.revisions[revision].maxCommand;
const nativeAction = 'pump.command.set' as SyntheticRefundOperation['action'];
const aelScenario = 'commit-response-lost' as AelState['scenarioId'];

export const DEFAULT_INCIDENT_EXPERIMENT: PlantIncidentExperiment = {
  scenarioVersion: 'faultline.plant-incident.v0.2',
  equipmentId: 'P-101',
  initialCommand: 0.4,
  proposedCommand: 0.7,
  revisedCommand: 0.5,
  revisionTiming: 'after-approval-before-effect',
  revisions: { R17: { maxCommand: 0.8 }, R18: { maxCommand: 0.55 } },
};

export const createIncidentExperiment = (
  patch: Partial<Pick<PlantIncidentExperiment, 'revisionTiming'>> = {},
): PlantIncidentExperiment => ({ ...DEFAULT_INCIDENT_EXPERIMENT, ...patch });

const operationFor = (command: number, revision: RevisionId, suffix: string) => ({
  operationId: `pump-command:P-101:${suffix}`,
  action: 'pump.command.set' as const,
  target: 'P-101' as const,
  arguments: { command },
  authorityRevision: revision,
});

const aelOperation = (operation: PumpOperation): SyntheticRefundOperation =>
  ({
    operationId: operation.operationId,
    tenant: 'plant-lab',
    principal: 'synthetic-operator',
    action: nativeAction,
    argumentsHash: digest({ action: operation.action, target: operation.target, ...operation.arguments }),
    amount: operation.arguments.command,
  }) as SyntheticRefundOperation;

const aelEvent = (
  event: IncidentEvent,
  type: ExecutionEventType,
  operation: PumpOperation | null,
): ExecutionEvent => ({
  eventId: `ael:${event.eventId}`,
  logicalTime: event.logicalTime,
  type,
  operationId: operation?.operationId ?? null,
  principal: operation ? 'synthetic-operator' : null,
  tenant: operation ? 'plant-lab' : null,
  action: operation ? nativeAction : null,
  argumentsHash: operation ? aelOperation(operation).argumentsHash : null,
  authorityId: event.revision ? `authority:${event.revision}:${operation?.operationId ?? 'basis'}` : null,
  authorityRevision: event.revision ? revisionNumber(event.revision) : null,
  effectId: event.effectId,
  workerId: operation ? `worker:${operation.operationId}` : null,
  detail: event.detail,
});

const buildAelState = (branch: IncidentBranch): AelState => {
  const authorizedOperations = branch.operations.filter((operation) =>
    branch.events.some(
      (event) => event.kind === 'AuthorityGranted' && event.operationId === operation.operationId,
    ),
  );
  const authorities: Authority[] = authorizedOperations.map((operation) => {
    const revision = operation.authorityRevision;
    return {
      authorityId: `authority:${revision}:${operation.operationId}`,
      revision: revisionNumber(revision),
      operationId: operation.operationId,
      tenant: 'plant-lab',
      principal: 'synthetic-operator',
      action: nativeAction,
      argumentsHash: aelOperation(operation).argumentsHash,
      status: revision === branch.currentRevision ? 'CURRENT' : 'SUPERSEDED',
    };
  });
  const workers: Worker[] = authorizedOperations.map((operation) => ({
    workerId: `worker:${operation.operationId}`,
    operation: aelOperation(operation),
    authorityId: `authority:${operation.authorityRevision}:${operation.operationId}`,
    authorityRevision: revisionNumber(operation.authorityRevision),
    runtimeTenant: 'plant-lab',
    status: branch.effects.some((effect) => effect.operation.operationId === operation.operationId)
      ? 'COMPLETED'
      : branch.status === 'rejected-stale'
        ? 'REJECTED'
        : 'READY',
  }));
  const effects: Effect[] = branch.effects.map((record) => ({
    effectId: record.effectId,
    operationId: record.operation.operationId,
    tenant: 'plant-lab',
    principal: 'synthetic-operator',
    action: nativeAction,
    argumentsHash: aelOperation(record.operation).argumentsHash,
    authorityId: `authority:${record.authorityRevision}:${record.operation.operationId}`,
    authorityRevision: revisionNumber(record.authorityRevision),
    currentAuthorityRevisionAtCommit: revisionNumber(record.currentRevisionAtCommit),
    workerId: `worker:${record.operation.operationId}`,
  }));
  return {
    scenarioId: aelScenario,
    logicalTime: branch.events.at(-1)?.logicalTime ?? 0,
    currentAuthorityRevision: revisionNumber(branch.currentRevision),
    authorities,
    workers,
    effects,
    accountings: effects.map((effect) => ({ effectId: effect.effectId, status: 'RECONCILED' as const })),
    events: branch.aelEvents,
  };
};

const evaluate = (branch: IncidentBranch): IncidentBranch => {
  const violation = checkAel(buildAelState(branch), true)[0] ?? null;
  const status = violation
    ? 'violation'
    : branch.status === 'rejected-stale' && branch.effects.length === 0
      ? 'rejected-stale'
      : branch.effects.length > 0
        ? 'pass'
        : 'waiting';
  if (!violation) return { ...branch, violation, status };
  const finding: IncidentEvent = {
    eventId: `finding:${violation.effectId ?? 'terminal'}`,
    logicalTime: (branch.events.at(-1)?.logicalTime ?? 0) + 1,
    lane: 'observation-faultline',
    kind: 'FaultlineFinding',
    equipmentId: 'P-101',
    operationId:
      branch.effects.find((effect) => effect.effectId === violation.effectId)?.operation.operationId ?? null,
    revision: null,
    currentRevisionAtCommit: null,
    command: null,
    effectId: violation.effectId,
    detail: violation.invariant,
  };
  return { ...branch, violation, status, events: [...branch.events, finding] };
};

const append = (
  branch: IncidentBranch,
  entry: Omit<IncidentEvent, 'eventId'>,
  aelType?: ExecutionEventType,
  operation?: PumpOperation | null,
): IncidentBranch => {
  const event = { ...entry, eventId: `${branch.branchId}:t${entry.logicalTime}:${entry.kind}` };
  return {
    ...branch,
    events: [...branch.events, event],
    aelEvents: aelType
      ? [...branch.aelEvents, aelEvent(event, aelType, operation ?? null)]
      : branch.aelEvents,
  };
};

const commitEffect = (branch: IncidentBranch, operation: PumpOperation, at: number): IncidentBranch => {
  const effectId = `effect:${operation.operationId}`;
  const plant = stepPlant(branch.plant, {
    pumpCommand: operation.arguments.command,
    sourceRevision: branch.currentRevision,
  });
  const committed = append(
    {
      ...branch,
      plant,
      pendingOperation: null,
      effects: [
        ...branch.effects,
        {
          effectId,
          operation,
          authorityRevision: operation.authorityRevision,
          currentRevisionAtCommit: branch.currentRevision,
        },
      ],
    },
    {
      logicalTime: at,
      lane: 'execution',
      kind: 'EffectCommitted',
      equipmentId: 'P-101',
      operationId: operation.operationId,
      revision: operation.authorityRevision,
      currentRevisionAtCommit: branch.currentRevision,
      command: operation.arguments.command,
      effectId,
      detail: `P-101 command ${operation.arguments.command.toFixed(2)} applied`,
    },
    'EffectCommitted',
    operation,
  );
  return append(
    committed,
    {
      logicalTime: at + 1,
      lane: 'observation-faultline',
      kind: 'ReadbackObserved',
      equipmentId: 'P-101',
      operationId: operation.operationId,
      revision: operation.authorityRevision,
      currentRevisionAtCommit: branch.currentRevision,
      command: operation.arguments.command,
      effectId,
      detail: `Readback observed P-101.command=${operation.arguments.command.toFixed(2)}`,
    },
    'ReadbackObserved',
    operation,
  );
};

const beginDispatch = (branch: IncidentBranch, at: number): IncidentBranch =>
  append(
    branch,
    {
      logicalTime: at,
      lane: 'execution',
      kind: 'DispatchStarted',
      equipmentId: 'P-101',
      operationId: branch.pendingOperation?.operationId ?? null,
      revision: branch.pendingOperation?.authorityRevision ?? null,
      currentRevisionAtCommit: null,
      command: branch.pendingOperation?.arguments.command ?? null,
      effectId: null,
      detail: 'Worker resumed the queued P-101 operation',
    },
    'DispatchStarted',
    branch.pendingOperation,
  );

const withR18 = (branch: IncidentBranch, at: number): IncidentBranch =>
  append(
    { ...branch, currentRevision: 'R18', plant: { ...branch.plant, sourceRevision: 'R18' } },
    {
      logicalTime: at,
      lane: 'proposal-authority',
      kind: 'AuthoritySuperseded',
      equipmentId: 'P-101',
      operationId: branch.pendingOperation?.operationId ?? null,
      revision: 'R18',
      currentRevisionAtCommit: null,
      command: null,
      effectId: null,
      detail: 'R18 is current; R17 is superseded',
    },
    'AuthoritySuperseded',
    branch.pendingOperation,
  );

const checkpointBranch = (checkpoint: IncidentCheckpoint, policy: ExecutionPolicy): IncidentBranch => ({
  branchId: policy,
  checkpointId: checkpoint.checkpointId,
  policy,
  plant: clone(checkpoint.plant),
  currentRevision: checkpoint.currentRevision,
  pendingOperation: clone(checkpoint.pendingOperation),
  operations: [clone(checkpoint.pendingOperation)],
  events: clone(checkpoint.prefixEvents),
  aelEvents: clone(checkpoint.prefixAelEvents),
  effects: [],
  violation: null,
  status: 'waiting',
});

const freshPath = (
  branch: IncidentBranch,
  experiment: PlantIncidentExperiment,
  at: number,
): IncidentBranch => {
  if (!canAuthorize(experiment, 'R18', experiment.revisedCommand))
    throw new Error('R18_REVISED_COMMAND_EXCEEDS_DECLARED_SYNTHETIC_MAXIMUM');
  const operation = operationFor(experiment.revisedCommand, 'R18', '002');
  const proposed = append(
    { ...branch, pendingOperation: operation, operations: [...branch.operations, operation] },
    {
      logicalTime: at,
      lane: 'proposal-authority',
      kind: 'ProposalCreated',
      equipmentId: 'P-101',
      operationId: operation.operationId,
      revision: 'R18',
      currentRevisionAtCommit: null,
      command: operation.arguments.command,
      effectId: null,
      detail: 'Fresh R18 proposal: P-101 command 0.50',
    },
    'ProposalCreated',
    operation,
  );
  const granted = append(
    proposed,
    {
      logicalTime: at + 1,
      lane: 'proposal-authority',
      kind: 'AuthorityGranted',
      equipmentId: 'P-101',
      operationId: operation.operationId,
      revision: 'R18',
      currentRevisionAtCommit: null,
      command: operation.arguments.command,
      effectId: null,
      detail: 'R18 authorized the fresh normalized command',
    },
    'AuthorityGranted',
    operation,
  );
  return evaluate(commitEffect(beginDispatch(granted, at + 2), operation, at + 3));
};

const rejectStale = (branch: IncidentBranch, at: number): IncidentBranch =>
  append(
    { ...branch, pendingOperation: null, status: 'rejected-stale' },
    {
      logicalTime: at,
      lane: 'execution',
      kind: 'ExecutionRejectedStale',
      equipmentId: 'P-101',
      operationId: branch.pendingOperation?.operationId ?? null,
      revision: branch.pendingOperation?.authorityRevision ?? null,
      currentRevisionAtCommit: branch.currentRevision,
      command: branch.pendingOperation?.arguments.command ?? null,
      effectId: null,
      detail: 'Final authority check rejected R17 work before the simulated actuator commit',
    },
    'EffectRejected',
    branch.pendingOperation,
  );

const commitAtEffectBoundary = (
  branch: IncidentBranch,
  experiment: PlantIncidentExperiment,
  operation: PumpOperation,
  at: number,
): IncidentBranch => {
  const currentBasisAllows = canAuthorize(experiment, branch.currentRevision, operation.arguments.command);
  if (operation.authorityRevision !== branch.currentRevision || !currentBasisAllows)
    return rejectStale(branch, at);
  return evaluate(commitEffect(branch, operation, at));
};

export const runIncident = (
  experiment: PlantIncidentExperiment = DEFAULT_INCIDENT_EXPERIMENT,
  options: Readonly<{ disableFinalRevalidation?: boolean }> = {},
): IncidentSession => {
  const initial = stepPlant(createInitialPlantState(), {
    pumpCommand: experiment.initialCommand,
    sourceRevision: 'R17',
  });
  if (!canAuthorize(experiment, 'R17', experiment.proposedCommand))
    throw new Error('R17_PROPOSED_COMMAND_EXCEEDS_DECLARED_SYNTHETIC_MAXIMUM');
  const proposed = operationFor(experiment.proposedCommand, 'R17', '001');
  const proposalEvent: IncidentEvent = {
    eventId: 'checkpoint:t1:ProposalCreated',
    logicalTime: 1,
    lane: 'proposal-authority',
    kind: 'ProposalCreated',
    equipmentId: 'P-101',
    operationId: proposed.operationId,
    revision: 'R17',
    currentRevisionAtCommit: null,
    command: proposed.arguments.command,
    effectId: null,
    detail: 'Proposed P-101 normalized command 0.70',
  };
  const approvalEvent: IncidentEvent = {
    eventId: 'checkpoint:t2:AuthorityGranted',
    logicalTime: 2,
    lane: 'proposal-authority',
    kind: 'AuthorityGranted',
    equipmentId: 'P-101',
    operationId: proposed.operationId,
    revision: 'R17',
    currentRevisionAtCommit: null,
    command: proposed.arguments.command,
    effectId: null,
    detail: 'R17 authorized the proposed command',
  };
  const checkpoint: IncidentCheckpoint = {
    checkpointId: `checkpoint:${digest({ experiment, phase: 'after-r17-approval' }).slice(0, 16)}`,
    logicalTime: 2,
    experiment: clone(experiment),
    plant: initial,
    currentRevision: 'R17',
    pendingOperation: proposed,
    prefixEvents: [proposalEvent, approvalEvent],
    prefixAelEvents: [
      aelEvent(proposalEvent, 'ProposalCreated', proposed),
      aelEvent(approvalEvent, 'AuthorityGranted', proposed),
    ],
  };
  let approvalOnly = checkpointBranch(checkpoint, 'approval-only');
  let revalidateAtEffectBoundary = checkpointBranch(checkpoint, 'revalidate-at-effect-boundary');

  if (experiment.revisionTiming === 'before-approval') {
    approvalOnly = withR18(approvalOnly, 1);
    revalidateAtEffectBoundary = withR18(revalidateAtEffectBoundary, 1);
    approvalOnly = freshPath(
      {
        ...approvalOnly,
        events: approvalOnly.events.filter((event) => event.logicalTime !== 1 && event.logicalTime !== 2),
        aelEvents: [],
      },
      experiment,
      2,
    );
    revalidateAtEffectBoundary = freshPath(
      {
        ...revalidateAtEffectBoundary,
        events: revalidateAtEffectBoundary.events.filter(
          (event) => event.logicalTime !== 1 && event.logicalTime !== 2,
        ),
        aelEvents: [],
      },
      experiment,
      2,
    );
  } else if (experiment.revisionTiming === 'after-valid-effect') {
    approvalOnly = withR18(commitEffect(beginDispatch(approvalOnly, 3), proposed, 4), 6);
    revalidateAtEffectBoundary = withR18(
      commitEffect(beginDispatch(revalidateAtEffectBoundary, 3), proposed, 4),
      6,
    );
    approvalOnly = evaluate(approvalOnly);
    revalidateAtEffectBoundary = evaluate(revalidateAtEffectBoundary);
  } else {
    approvalOnly = withR18(approvalOnly, 3);
    revalidateAtEffectBoundary = withR18(revalidateAtEffectBoundary, 3);
    approvalOnly = evaluate(commitEffect(beginDispatch(approvalOnly, 4), proposed, 5));
    revalidateAtEffectBoundary = options.disableFinalRevalidation
      ? evaluate(commitEffect(beginDispatch(revalidateAtEffectBoundary, 4), proposed, 5))
      : commitAtEffectBoundary(beginDispatch(revalidateAtEffectBoundary, 4), experiment, proposed, 5);
  }
  return {
    experiment: clone(experiment),
    checkpoint: clone(checkpoint),
    approvalOnly,
    revalidateAtEffectBoundary,
    revisedProposalApproved: false,
  };
};

export const approveRevisedProposal = (session: IncidentSession): IncidentSession => {
  if (session.revisedProposalApproved || session.experiment.revisionTiming !== 'after-approval-before-effect')
    return session;
  if (session.revalidateAtEffectBoundary.status !== 'rejected-stale') return session;
  return {
    ...session,
    revalidateAtEffectBoundary: freshPath(session.revalidateAtEffectBoundary, session.experiment, 5),
    revisedProposalApproved: true,
  };
};

const semanticCapsule = (session: IncidentSession) => ({
  schemaVersion: 'faultline.plant-incident-capsule.v1' as const,
  plantModelVersion: 'normalized-ro-v0.1' as const,
  experiment: session.experiment,
  checkpoint: session.checkpoint,
  branches: {
    approvalOnly: session.approvalOnly,
    revalidateAtEffectBoundary: session.revalidateAtEffectBoundary,
  },
  revisedProposalApproved: session.revisedProposalApproved,
});

export const incidentSemanticDigest = (session: IncidentSession): string => digest(semanticCapsule(session));

export const exportIncidentCapsule = (
  session: IncidentSession,
  presentation?: PlantIncidentCapsule['presentation'],
): PlantIncidentCapsule => ({
  ...semanticCapsule(session),
  semanticDigest: incidentSemanticDigest(session),
  ...(presentation ? { presentation } : {}),
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export const importIncidentCapsule = (value: unknown): IncidentSession => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'faultline.plant-incident-capsule.v1' ||
    typeof value.semanticDigest !== 'string'
  )
    throw new Error('INVALID_PLANT_INCIDENT_CAPSULE_SCHEMA');
  const experiment = value.experiment as PlantIncidentExperiment;
  if (
    !isRecord(experiment) ||
    experiment.equipmentId !== 'P-101' ||
    typeof experiment.revisionTiming !== 'string'
  )
    throw new Error('INVALID_PLANT_INCIDENT_EXPERIMENT');
  let session = runIncident(experiment);
  if (value.revisedProposalApproved === true) session = approveRevisedProposal(session);
  if (incidentSemanticDigest(session) !== value.semanticDigest)
    throw new Error('PLANT_INCIDENT_CAPSULE_DIGEST_MISMATCH');
  return session;
};

export const replayIncidentCapsule = (value: unknown) => {
  const session = importIncidentCapsule(value);
  return {
    session,
    semanticDigest: incidentSemanticDigest(session),
    approvalOnly: session.approvalOnly.violation?.invariant ?? 'PASS',
    revalidateAtEffectBoundary: session.revalidateAtEffectBoundary.violation?.invariant ?? 'PASS',
  } as const;
};

export const firstViolatingEvent = (branch: IncidentBranch): IncidentEvent | null => {
  if (!branch.violation) return null;
  const effect = branch.effects.find((record) => record.effectId === branch.violation?.effectId);
  return (
    branch.events.find((event) => event.effectId === effect?.effectId && event.kind === 'EffectCommitted') ??
    null
  );
};

export const incidentCanonicalJson = (session: IncidentSession): string =>
  canonicalize(exportIncidentCapsule(session));
