import { canonicalize, digest } from '../../contracts/src/index.js';

export const AEL_INVARIANTS = [
  'I1_NO_EFFECT_WITHOUT_AUTHORITY',
  'I2_APPROVAL_BINDS_EXACT_ARGUMENTS',
  'I3_STALE_AUTHORITY_CANNOT_COMMIT',
  'I4_LOGICAL_EFFECT_AT_MOST_ONCE',
  'I5_TENANT_PRINCIPAL_CANNOT_DRIFT',
  'I6_COMMITTED_EFFECT_IS_ACCOUNTED',
] as const;
export type AelInvariant = (typeof AEL_INVARIANTS)[number];
export type ScenarioId = 'refund-stale-approval' | 'commit-response-lost' | 'cross-tenant-resume';
export type ExpectedScenarioResult = 'COUNTEREXAMPLE' | 'PASS';
export type ExecutionEventType =
  | 'ProposalCreated'
  | 'AuthorityGranted'
  | 'AuthorityRevoked'
  | 'AuthoritySuperseded'
  | 'DispatchStarted'
  | 'EffectCommitted'
  | 'EffectRejected'
  | 'ResponseDelivered'
  | 'ResponseLost'
  | 'ReadbackObserved'
  | 'ReceiptPersisted'
  | 'WorkerCrashed'
  | 'WorkerRestarted'
  | 'TenantContextDrift'
  | 'RetrySuppressed';
export type SyntheticRefundOperation = {
  operationId: string;
  tenant: string;
  principal: string;
  action: 'REFUND';
  argumentsHash: string;
  amount: number;
};
export type Authority = {
  authorityId: string;
  revision: number;
  operationId: string;
  tenant: string;
  principal: string;
  action: SyntheticRefundOperation['action'];
  argumentsHash: string;
  status: 'CURRENT' | 'SUPERSEDED' | 'REVOKED';
};
export type WorkerStatus =
  'READY' | 'DISPATCHED' | 'CRASHED' | 'AWAITING_ACCOUNTING' | 'RETRY_SUPPRESSED' | 'COMPLETED' | 'REJECTED';
export type Worker = {
  workerId: string;
  operation: SyntheticRefundOperation;
  authorityId: string;
  authorityRevision: number;
  runtimeTenant: string;
  status: WorkerStatus;
};
export type AccountingStatus =
  'PENDING' | 'RESPONSE_DELIVERED' | 'RECEIPT_PERSISTED' | 'IN_DOUBT' | 'READBACK_OBSERVED' | 'RECONCILED';
export type Effect = {
  effectId: string;
  operationId: string;
  tenant: string;
  principal: string;
  action: SyntheticRefundOperation['action'];
  argumentsHash: string;
  authorityId: string;
  authorityRevision: number;
  currentAuthorityRevisionAtCommit: number;
  workerId: string;
};
export type EffectAccounting = { effectId: string; status: AccountingStatus };
export type ExecutionEvent = {
  eventId: string;
  logicalTime: number;
  type: ExecutionEventType;
  operationId: string | null;
  principal: string | null;
  tenant: string | null;
  action: SyntheticRefundOperation['action'] | null;
  argumentsHash: string | null;
  authorityId: string | null;
  authorityRevision: number | null;
  effectId: string | null;
  workerId: string | null;
  detail: string;
};
export type AelState = {
  scenarioId: ScenarioId;
  logicalTime: number;
  currentAuthorityRevision: number;
  authorities: readonly Authority[];
  workers: readonly Worker[];
  effects: readonly Effect[];
  accountings: readonly EffectAccounting[];
  events: readonly ExecutionEvent[];
};
export type TransitionKind =
  | 'DISPATCH'
  | 'COMMIT'
  | 'SUPERSEDE_AUTHORITY'
  | 'CRASH'
  | 'RESTART'
  | 'DRIFT_TENANT'
  | 'RESPONSE_LOST'
  | 'RESPONSE_DELIVERED'
  | 'PERSIST_RECEIPT'
  | 'READBACK'
  | 'RETRY_SUPPRESSED';
export type ScheduledTransition = {
  id: string;
  kind: TransitionKind;
  workerId: string | null;
  effectId: string | null;
};
export type AelViolation = {
  invariant: AelInvariant;
  code: string;
  message: string;
  effectId: string | null;
};
export type CounterexampleCapsule = {
  schemaVersion: 'faultline.counterexample.v1';
  counterexampleId: string;
  scenarioId: ScenarioId;
  invariant: AelInvariant;
  code: string;
  transitionIds: readonly string[];
  events: readonly ExecutionEvent[];
  minimized: boolean;
};
export type ExplorationBounds = { maxDepth: number; maxStates: number };
export type ExplorationResult = {
  scenarioId: ScenarioId;
  expected: ExpectedScenarioResult;
  exploredStates: number;
  schedulesExplored: number;
  decisionsExplored: number;
  faultDecisions: number;
  cutoffStates: number;
  counterexamples: readonly CounterexampleCapsule[];
};
export type ReplayResult = {
  reproduced: boolean;
  state: AelState;
  violation: AelViolation | null;
  events: readonly ExecutionEvent[];
  error: string | null;
};
const executionEventTypes: readonly ExecutionEventType[] = [
  'ProposalCreated',
  'AuthorityGranted',
  'AuthorityRevoked',
  'AuthoritySuperseded',
  'DispatchStarted',
  'EffectCommitted',
  'EffectRejected',
  'ResponseDelivered',
  'ResponseLost',
  'ReadbackObserved',
  'ReceiptPersisted',
  'WorkerCrashed',
  'WorkerRestarted',
  'TenantContextDrift',
  'RetrySuppressed',
];

const operation = (
  operationId: string,
  tenant: string,
  principal: string,
  amount: number,
): SyntheticRefundOperation => ({
  operationId,
  tenant,
  principal,
  action: 'REFUND',
  argumentsHash: digest({ action: 'REFUND', order: 'synthetic-order-42', amount }),
  amount,
});
const authorityFor = (authorityId: string, revision: number, value: SyntheticRefundOperation): Authority => ({
  authorityId,
  revision,
  operationId: value.operationId,
  tenant: value.tenant,
  principal: value.principal,
  action: value.action,
  argumentsHash: value.argumentsHash,
  status: 'CURRENT',
});
const workerFor = (workerId: string, value: SyntheticRefundOperation, authority: Authority): Worker => ({
  workerId,
  operation: value,
  authorityId: authority.authorityId,
  authorityRevision: authority.revision,
  runtimeTenant: value.tenant,
  status: 'READY',
});
export const scenarioExpectedResult = (scenarioId: ScenarioId): ExpectedScenarioResult =>
  scenarioId === 'refund-stale-approval' ? 'COUNTEREXAMPLE' : 'PASS';
export const defaultBoundsFor = (scenarioId: ScenarioId): ExplorationBounds =>
  scenarioId === 'refund-stale-approval'
    ? { maxDepth: 7, maxStates: 2_000 }
    : { maxDepth: 8, maxStates: 2_000 };

export const createInitialState = (scenarioId: ScenarioId): AelState => {
  const initial = operation(
    'refund-42-r17',
    'tenant-A',
    'human-1',
    scenarioId === 'refund-stale-approval' ? 100 : 50,
  );
  const authority = authorityFor('authority-r17', 17, initial);
  return {
    scenarioId,
    logicalTime: 2,
    currentAuthorityRevision: 17,
    authorities: [authority],
    workers: [workerFor('worker-A', initial, authority)],
    effects: [],
    accountings: [],
    events: [
      event(1, 'ProposalCreated', initial, authority, null, 'worker-A', 'synthetic proposal created'),
      event(2, 'AuthorityGranted', initial, authority, null, 'worker-A', 'synthetic authority R17 granted'),
    ],
  };
};

const event = (
  logicalTime: number,
  type: ExecutionEventType,
  value: SyntheticRefundOperation | null,
  authority: Authority | null,
  effect: Effect | null,
  workerId: string | null,
  detail: string,
): ExecutionEvent => ({
  eventId: `event-${logicalTime}`,
  logicalTime,
  type,
  operationId: value?.operationId ?? effect?.operationId ?? null,
  principal: value?.principal ?? effect?.principal ?? null,
  tenant: value?.tenant ?? effect?.tenant ?? null,
  action: value?.action ?? effect?.action ?? null,
  argumentsHash: value?.argumentsHash ?? effect?.argumentsHash ?? null,
  authorityId: authority?.authorityId ?? effect?.authorityId ?? null,
  authorityRevision: authority?.revision ?? effect?.authorityRevision ?? null,
  effectId: effect?.effectId ?? null,
  workerId,
  detail,
});
const workerById = (state: AelState, workerId: string) =>
  state.workers.find((worker) => worker.workerId === workerId);
const effectById = (state: AelState, effectId: string) =>
  state.effects.find((effect) => effect.effectId === effectId);
const accountingFor = (state: AelState, effectId: string) =>
  state.accountings.find((accounting) => accounting.effectId === effectId);
const authorityById = (state: AelState, authorityId: string) =>
  state.authorities.find((authority) => authority.authorityId === authorityId);
const replaceWorker = (state: AelState, changed: Worker) =>
  state.workers.map((worker) => (worker.workerId === changed.workerId ? changed : worker));
const replaceAccounting = (state: AelState, changed: EffectAccounting) =>
  state.accountings.map((accounting) => (accounting.effectId === changed.effectId ? changed : accounting));
const appendEvent = (
  state: AelState,
  type: ExecutionEventType,
  value: SyntheticRefundOperation | null,
  authority: Authority | null,
  effect: Effect | null,
  workerId: string | null,
  detail: string,
): AelState => {
  const logicalTime = state.logicalTime + 1;
  return {
    ...state,
    logicalTime,
    events: [...state.events, event(logicalTime, type, value, authority, effect, workerId, detail)],
  };
};
const isUnsafeStaleAuthorityModel = (state: AelState) => state.scenarioId === 'refund-stale-approval';
const isFault = (kind: TransitionKind) =>
  kind === 'SUPERSEDE_AUTHORITY' || kind === 'CRASH' || kind === 'DRIFT_TENANT' || kind === 'RESPONSE_LOST';

export const enabledTransitions = (state: AelState): readonly ScheduledTransition[] => {
  const transitions: ScheduledTransition[] = [];
  for (const worker of state.workers) {
    if (worker.status === 'READY')
      transitions.push({
        id: `dispatch:${worker.workerId}`,
        kind: 'DISPATCH',
        workerId: worker.workerId,
        effectId: null,
      });
    if (worker.status === 'DISPATCHED') {
      transitions.push({
        id: `commit:${worker.workerId}`,
        kind: 'COMMIT',
        workerId: worker.workerId,
        effectId: null,
      });
      transitions.push({
        id: `crash:${worker.workerId}`,
        kind: 'CRASH',
        workerId: worker.workerId,
        effectId: null,
      });
      if (state.scenarioId === 'cross-tenant-resume' && worker.runtimeTenant === worker.operation.tenant)
        transitions.push({
          id: `drift:${worker.workerId}`,
          kind: 'DRIFT_TENANT',
          workerId: worker.workerId,
          effectId: null,
        });
    }
    if (worker.status === 'CRASHED')
      transitions.push({
        id: `restart:${worker.workerId}`,
        kind: 'RESTART',
        workerId: worker.workerId,
        effectId: null,
      });
    if (worker.status === 'AWAITING_ACCOUNTING') {
      const ownedEffect = state.effects.find((effect) => effect.workerId === worker.workerId);
      if (ownedEffect && accountingFor(state, ownedEffect.effectId)?.status === 'IN_DOUBT')
        transitions.push({
          id: `retry-suppressed:${worker.workerId}`,
          kind: 'RETRY_SUPPRESSED',
          workerId: worker.workerId,
          effectId: ownedEffect.effectId,
        });
    }
  }
  if (state.scenarioId === 'refund-stale-approval' && state.currentAuthorityRevision === 17)
    transitions.push({
      id: 'supersede:authority-r17',
      kind: 'SUPERSEDE_AUTHORITY',
      workerId: null,
      effectId: null,
    });
  for (const effect of state.effects) {
    const accounting = accountingFor(state, effect.effectId);
    if (!accounting) continue;
    if (accounting.status === 'PENDING') {
      transitions.push({
        id: `response-lost:${effect.effectId}`,
        kind: 'RESPONSE_LOST',
        workerId: effect.workerId,
        effectId: effect.effectId,
      });
      transitions.push({
        id: `response-delivered:${effect.effectId}`,
        kind: 'RESPONSE_DELIVERED',
        workerId: effect.workerId,
        effectId: effect.effectId,
      });
    }
    if (accounting.status === 'RESPONSE_DELIVERED')
      transitions.push({
        id: `receipt:${effect.effectId}`,
        kind: 'PERSIST_RECEIPT',
        workerId: effect.workerId,
        effectId: effect.effectId,
      });
    if (accounting.status === 'IN_DOUBT')
      transitions.push({
        id: `readback:${effect.effectId}`,
        kind: 'READBACK',
        workerId: effect.workerId,
        effectId: effect.effectId,
      });
  }
  return transitions.sort((left, right) => left.id.localeCompare(right.id));
};

export const applyTransition = (state: AelState, transition: ScheduledTransition): AelState => {
  if (!enabledTransitions(state).some((candidate) => candidate.id === transition.id))
    throw new Error(`TRANSITION_NOT_ENABLED:${transition.id}`);
  if (transition.kind === 'SUPERSEDE_AUTHORITY') {
    const oldAuthority = authorityById(state, 'authority-r17');
    const workerA = workerById(state, 'worker-A');
    if (!oldAuthority || !workerA) throw new Error('INVALID_REFUND_MODEL_STATE');
    const nextOperation = operation('refund-42-r18', 'tenant-A', 'human-1', 20);
    const nextAuthority = authorityFor('authority-r18', 18, nextOperation);
    const next = appendEvent(
      {
        ...state,
        currentAuthorityRevision: 18,
        authorities: state.authorities
          .map((authority) =>
            authority.authorityId === oldAuthority.authorityId
              ? { ...authority, status: 'SUPERSEDED' as const }
              : authority,
          )
          .concat(nextAuthority),
        workers: [...state.workers, workerFor('worker-B', nextOperation, nextAuthority)],
      },
      'AuthoritySuperseded',
      nextOperation,
      nextAuthority,
      null,
      null,
      'synthetic refund authority changed from R17 to R18',
    );
    return next;
  }
  if (!transition.workerId) throw new Error(`WORKER_REQUIRED:${transition.kind}`);
  const worker = workerById(state, transition.workerId);
  if (!worker) throw new Error(`UNKNOWN_WORKER:${transition.workerId}`);
  if (transition.kind === 'DISPATCH')
    return appendEvent(
      { ...state, workers: replaceWorker(state, { ...worker, status: 'DISPATCHED' }) },
      'DispatchStarted',
      worker.operation,
      authorityById(state, worker.authorityId) ?? null,
      null,
      worker.workerId,
      'synthetic dispatch started',
    );
  if (transition.kind === 'CRASH')
    return appendEvent(
      { ...state, workers: replaceWorker(state, { ...worker, status: 'CRASHED' }) },
      'WorkerCrashed',
      worker.operation,
      authorityById(state, worker.authorityId) ?? null,
      null,
      worker.workerId,
      'synthetic worker crash after dispatch',
    );
  if (transition.kind === 'RESTART')
    return appendEvent(
      { ...state, workers: replaceWorker(state, { ...worker, status: 'DISPATCHED' }) },
      'WorkerRestarted',
      worker.operation,
      authorityById(state, worker.authorityId) ?? null,
      null,
      worker.workerId,
      'synthetic worker resumed its dispatch state',
    );
  if (transition.kind === 'DRIFT_TENANT')
    return appendEvent(
      { ...state, workers: replaceWorker(state, { ...worker, runtimeTenant: 'tenant-B' }) },
      'TenantContextDrift',
      worker.operation,
      authorityById(state, worker.authorityId) ?? null,
      null,
      worker.workerId,
      'synthetic resumed context drifted to tenant-B',
    );
  if (transition.kind === 'COMMIT') {
    const authority = authorityById(state, worker.authorityId);
    if (!authority) throw new Error(`UNKNOWN_AUTHORITY:${worker.authorityId}`);
    const mustReject =
      !isUnsafeStaleAuthorityModel(state) &&
      (authority.revision !== state.currentAuthorityRevision ||
        authority.status !== 'CURRENT' ||
        worker.runtimeTenant !== worker.operation.tenant ||
        authority.tenant !== worker.operation.tenant ||
        authority.principal !== worker.operation.principal ||
        authority.argumentsHash !== worker.operation.argumentsHash);
    if (mustReject)
      return appendEvent(
        { ...state, workers: replaceWorker(state, { ...worker, status: 'REJECTED' }) },
        'EffectRejected',
        worker.operation,
        authority,
        null,
        worker.workerId,
        'current authority or runtime scope no longer admits the synthetic effect',
      );
    const effect: Effect = {
      effectId: `effect-${worker.operation.operationId}`,
      operationId: worker.operation.operationId,
      tenant: worker.runtimeTenant,
      principal: worker.operation.principal,
      action: worker.operation.action,
      argumentsHash: worker.operation.argumentsHash,
      authorityId: authority.authorityId,
      authorityRevision: authority.revision,
      currentAuthorityRevisionAtCommit: state.currentAuthorityRevision,
      workerId: worker.workerId,
    };
    return appendEvent(
      {
        ...state,
        workers: replaceWorker(state, { ...worker, status: 'AWAITING_ACCOUNTING' }),
        effects: [...state.effects, effect],
        accountings: [...state.accountings, { effectId: effect.effectId, status: 'PENDING' }],
      },
      'EffectCommitted',
      worker.operation,
      authority,
      effect,
      worker.workerId,
      'synthetic external refund effect committed',
    );
  }
  if (!transition.effectId) throw new Error(`EFFECT_REQUIRED:${transition.kind}`);
  const effect = effectById(state, transition.effectId);
  const accounting = accountingFor(state, transition.effectId);
  if (!effect || !accounting) throw new Error(`UNKNOWN_EFFECT:${transition.effectId}`);
  const owner = workerById(state, effect.workerId);
  if (!owner) throw new Error(`UNKNOWN_EFFECT_OWNER:${effect.effectId}`);
  if (transition.kind === 'RESPONSE_LOST')
    return appendEvent(
      { ...state, accountings: replaceAccounting(state, { ...accounting, status: 'IN_DOUBT' }) },
      'ResponseLost',
      owner.operation,
      authorityById(state, effect.authorityId) ?? null,
      effect,
      owner.workerId,
      'synthetic response was lost after effect commit',
    );
  if (transition.kind === 'RESPONSE_DELIVERED')
    return appendEvent(
      { ...state, accountings: replaceAccounting(state, { ...accounting, status: 'RESPONSE_DELIVERED' }) },
      'ResponseDelivered',
      owner.operation,
      authorityById(state, effect.authorityId) ?? null,
      effect,
      owner.workerId,
      'synthetic provider response delivered',
    );
  if (transition.kind === 'PERSIST_RECEIPT')
    return appendEvent(
      {
        ...state,
        accountings: replaceAccounting(state, { ...accounting, status: 'RECEIPT_PERSISTED' }),
        workers: replaceWorker(state, { ...owner, status: 'COMPLETED' }),
      },
      'ReceiptPersisted',
      owner.operation,
      authorityById(state, effect.authorityId) ?? null,
      effect,
      owner.workerId,
      'synthetic receipt persisted',
    );
  if (transition.kind === 'READBACK')
    return appendEvent(
      {
        ...state,
        accountings: replaceAccounting(state, { ...accounting, status: 'RECONCILED' }),
        workers: replaceWorker(state, { ...owner, status: 'COMPLETED' }),
      },
      'ReadbackObserved',
      owner.operation,
      authorityById(state, effect.authorityId) ?? null,
      effect,
      owner.workerId,
      'synthetic readback reconciled the committed effect',
    );
  if (transition.kind === 'RETRY_SUPPRESSED')
    return appendEvent(
      { ...state, workers: replaceWorker(state, { ...owner, status: 'RETRY_SUPPRESSED' }) },
      'RetrySuppressed',
      owner.operation,
      authorityById(state, effect.authorityId) ?? null,
      effect,
      owner.workerId,
      'same logical operation already has a committed synthetic effect',
    );
  throw new Error(`UNHANDLED_TRANSITION:${transition.kind}`);
};

export const checkAel = (state: AelState, terminal = false): readonly AelViolation[] => {
  const violations: AelViolation[] = [];
  for (const effect of state.effects) {
    const authority = authorityById(state, effect.authorityId);
    if (!authority || authority.operationId !== effect.operationId || authority.action !== effect.action)
      violations.push({
        invariant: 'I1_NO_EFFECT_WITHOUT_AUTHORITY',
        code: 'NO_MATCHING_AUTHORITY',
        message: 'A committed effect has no authority for its exact logical operation.',
        effectId: effect.effectId,
      });
    if (authority && authority.argumentsHash !== effect.argumentsHash)
      violations.push({
        invariant: 'I2_APPROVAL_BINDS_EXACT_ARGUMENTS',
        code: 'AUTHORITY_ARGUMENTS_MISMATCH',
        message: 'A committed effect differs from its authority-bound arguments.',
        effectId: effect.effectId,
      });
    if (!authority || effect.authorityRevision !== effect.currentAuthorityRevisionAtCommit)
      violations.push({
        invariant: 'I3_STALE_AUTHORITY_CANNOT_COMMIT',
        code: 'STALE_AUTHORITY_EFFECT',
        message: 'A committed effect used an authority revision that was not current at commit time.',
        effectId: effect.effectId,
      });
    if (
      !authority ||
      authority.tenant !== effect.tenant ||
      authority.principal !== effect.principal ||
      effect.tenant !== state.workers.find((worker) => worker.workerId === effect.workerId)?.operation.tenant
    )
      violations.push({
        invariant: 'I5_TENANT_PRINCIPAL_CANNOT_DRIFT',
        code: 'TENANT_OR_PRINCIPAL_DRIFT',
        message: 'A committed effect escaped its authority-bound tenant or principal.',
        effectId: effect.effectId,
      });
  }
  const effectsByOperation = new Map<string, Effect[]>();
  for (const effect of state.effects) {
    const prior = effectsByOperation.get(effect.operationId) ?? [];
    effectsByOperation.set(effect.operationId, [...prior, effect]);
  }
  for (const [operationId, effects] of effectsByOperation)
    if (effects.length > 1)
      violations.push({
        invariant: 'I4_LOGICAL_EFFECT_AT_MOST_ONCE',
        code: 'DUPLICATE_LOGICAL_EFFECT',
        message: `Logical operation ${operationId} committed more than one external effect.`,
        effectId: effects[0]?.effectId ?? null,
      });
  if (terminal)
    for (const effect of state.effects) {
      const accounting = accountingFor(state, effect.effectId);
      if (
        !accounting ||
        !['RECEIPT_PERSISTED', 'IN_DOUBT', 'READBACK_OBSERVED', 'RECONCILED'].includes(accounting.status)
      )
        violations.push({
          invariant: 'I6_COMMITTED_EFFECT_IS_ACCOUNTED',
          code: 'UNACCOUNTED_COMMITTED_EFFECT',
          message: 'A quiescent committed effect has neither evidence nor an explicit in-doubt state.',
          effectId: effect.effectId,
        });
    }
  return violations;
};

const fingerprint = (state: AelState) =>
  canonicalize({
    scenarioId: state.scenarioId,
    currentAuthorityRevision: state.currentAuthorityRevision,
    authorities: state.authorities,
    workers: state.workers,
    effects: state.effects,
    accountings: state.accountings,
  });
const firstViolation = (state: AelState, terminal = false) => checkAel(state, terminal)[0] ?? null;
const replayTransitions = (scenarioId: ScenarioId, transitionIds: readonly string[]): ReplayResult => {
  let state = createInitialState(scenarioId);
  for (const transitionId of transitionIds) {
    const transition = enabledTransitions(state).find((candidate) => candidate.id === transitionId);
    if (!transition)
      return {
        reproduced: false,
        state,
        violation: null,
        events: state.events,
        error: `TRANSITION_NOT_REPLAYABLE:${transitionId}`,
      };
    state = applyTransition(state, transition);
    const violation = firstViolation(state);
    if (violation) return { reproduced: true, state, violation, events: state.events, error: null };
  }
  const violation = firstViolation(state, enabledTransitions(state).length === 0);
  return { reproduced: Boolean(violation), state, violation, events: state.events, error: null };
};
export const shrinkCounterexample = (capsule: CounterexampleCapsule): CounterexampleCapsule => {
  let kept = [...capsule.transitionIds];
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < kept.length; index += 1) {
      const candidate = kept.filter((_, candidateIndex) => candidateIndex !== index);
      const replay = replayTransitions(capsule.scenarioId, candidate);
      if (replay.reproduced && replay.violation?.invariant === capsule.invariant) {
        kept = candidate;
        changed = true;
        break;
      }
    }
  }
  const replay = replayTransitions(capsule.scenarioId, kept);
  if (!replay.reproduced || !replay.violation) throw new Error('COUNTEREXAMPLE_SHRINK_LOST_VIOLATION');
  return {
    ...capsule,
    code: replay.violation.code,
    transitionIds: kept,
    events: replay.events,
    minimized: true,
  };
};
export const exploreScenario = (
  scenarioId: ScenarioId,
  bounds: ExplorationBounds = defaultBoundsFor(scenarioId),
): ExplorationResult => {
  type QueueItem = { state: AelState; transitionIds: readonly string[] };
  const initial = createInitialState(scenarioId);
  const queue: QueueItem[] = [{ state: initial, transitionIds: [] }];
  const seen = new Set([fingerprint(initial)]);
  const counterexamples: CounterexampleCapsule[] = [];
  let exploredStates = 0;
  let schedulesExplored = 0;
  let decisionsExplored = 0;
  let faultDecisions = 0;
  let cutoffStates = 0;
  while (queue.length > 0 && exploredStates < bounds.maxStates) {
    const item = queue.shift();
    if (!item) break;
    exploredStates += 1;
    const transitions = enabledTransitions(item.state);
    if (transitions.length === 0) {
      schedulesExplored += 1;
      const violation = firstViolation(item.state, true);
      if (violation)
        counterexamples.push(
          shrinkCounterexample({
            schemaVersion: 'faultline.counterexample.v1',
            counterexampleId: `FL-${String(counterexamples.length + 1).padStart(4, '0')}`,
            scenarioId,
            invariant: violation.invariant,
            code: violation.code,
            transitionIds: item.transitionIds,
            events: item.state.events,
            minimized: false,
          }),
        );
      continue;
    }
    if (item.transitionIds.length >= bounds.maxDepth) {
      cutoffStates += 1;
      continue;
    }
    for (const transition of transitions) {
      decisionsExplored += 1;
      if (isFault(transition.kind)) faultDecisions += 1;
      const next = applyTransition(item.state, transition);
      const transitionIds = [...item.transitionIds, transition.id];
      const violation = firstViolation(next);
      if (violation) {
        schedulesExplored += 1;
        counterexamples.push(
          shrinkCounterexample({
            schemaVersion: 'faultline.counterexample.v1',
            counterexampleId: `FL-${String(counterexamples.length + 1).padStart(4, '0')}`,
            scenarioId,
            invariant: violation.invariant,
            code: violation.code,
            transitionIds,
            events: next.events,
            minimized: false,
          }),
        );
        continue;
      }
      const stateFingerprint = fingerprint(next);
      if (!seen.has(stateFingerprint)) {
        seen.add(stateFingerprint);
        queue.push({ state: next, transitionIds });
      }
    }
  }
  cutoffStates += queue.length;
  return {
    scenarioId,
    expected: scenarioExpectedResult(scenarioId),
    exploredStates,
    schedulesExplored,
    decisionsExplored,
    faultDecisions,
    cutoffStates,
    counterexamples,
  };
};
export const replayCounterexample = (capsule: CounterexampleCapsule): ReplayResult => {
  if (capsule.schemaVersion !== 'faultline.counterexample.v1')
    return {
      reproduced: false,
      state: createInitialState(capsule.scenarioId),
      violation: null,
      events: [],
      error: 'UNSUPPORTED_COUNTEREXAMPLE_SCHEMA',
    };
  const replay = replayTransitions(capsule.scenarioId, capsule.transitionIds);
  if (
    !replay.reproduced ||
    replay.violation?.invariant !== capsule.invariant ||
    replay.violation.code !== capsule.code
  )
    return { ...replay, reproduced: false, error: replay.error ?? 'EXPECTED_VIOLATION_NOT_REPRODUCED' };
  return replay;
};
export const parseCounterexampleCapsule = (value: unknown): CounterexampleCapsule | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 'faultline.counterexample.v1' ||
    typeof candidate.counterexampleId !== 'string' ||
    !isScenarioId(candidate.scenarioId) ||
    !isAelInvariant(candidate.invariant) ||
    typeof candidate.code !== 'string' ||
    !Array.isArray(candidate.transitionIds) ||
    candidate.transitionIds.some((id) => typeof id !== 'string') ||
    !Array.isArray(candidate.events) ||
    candidate.events.some((event) => !isExecutionEvent(event)) ||
    typeof candidate.minimized !== 'boolean'
  )
    return null;
  return candidate as CounterexampleCapsule;
};
const isExecutionEvent = (value: unknown): value is ExecutionEvent => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  return (
    typeof event.eventId === 'string' &&
    typeof event.logicalTime === 'number' &&
    executionEventTypes.includes(event.type as ExecutionEventType) &&
    (typeof event.operationId === 'string' || event.operationId === null) &&
    (typeof event.principal === 'string' || event.principal === null) &&
    (typeof event.tenant === 'string' || event.tenant === null) &&
    (event.action === 'REFUND' || event.action === null) &&
    (typeof event.argumentsHash === 'string' || event.argumentsHash === null) &&
    (typeof event.authorityId === 'string' || event.authorityId === null) &&
    (typeof event.authorityRevision === 'number' || event.authorityRevision === null) &&
    (typeof event.effectId === 'string' || event.effectId === null) &&
    (typeof event.workerId === 'string' || event.workerId === null) &&
    typeof event.detail === 'string'
  );
};
export const isScenarioId = (value: unknown): value is ScenarioId =>
  value === 'refund-stale-approval' || value === 'commit-response-lost' || value === 'cross-tenant-resume';
export const isAelInvariant = (value: unknown): value is AelInvariant =>
  typeof value === 'string' && AEL_INVARIANTS.includes(value as AelInvariant);
