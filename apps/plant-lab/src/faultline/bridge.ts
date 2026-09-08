import witnessJson from '../../../../failures/FL-0001.json' with { type: 'json' };
import {
  applyTransition,
  checkAel,
  createInitialState,
  enabledTransitions,
  parseCounterexampleCapsule,
  replayCounterexample,
  type AelState,
  type AelViolation,
  type CounterexampleCapsule,
  type ExecutionEvent,
  type ScenarioId,
} from '../../../../packages/counterexample/src/index.js';

export type LabScenario = 'safe' | 'stale' | 'replay';

export type FaultlineTrace = Readonly<{
  scenario: LabScenario;
  aelScenario: ScenarioId;
  transitionIds: readonly string[];
  state: AelState;
  cursor: number;
  replayWitness: CounterexampleCapsule | null;
}>;

export type FaultlineStep = Readonly<{
  trace: FaultlineTrace;
  events: readonly ExecutionEvent[];
  violation: AelViolation | null;
  complete: boolean;
}>;

const SAFE_TRANSITIONS = [
  'dispatch:worker-A',
  'commit:worker-A',
  'response-lost:effect-refund-42-r17',
  'readback:effect-refund-42-r17',
] as const;

const staleWitness = (): CounterexampleCapsule => {
  const parsed = parseCounterexampleCapsule(witnessJson);
  if (!parsed) throw new Error('PLANT_LAB_WITNESS_INVALID');
  return parsed;
};

export const createFaultlineTrace = (scenario: LabScenario): FaultlineTrace => {
  const replayWitness = scenario === 'replay' ? staleWitness() : null;
  if (replayWitness) {
    const replay = replayCounterexample(replayWitness);
    if (!replay.reproduced || !replay.violation)
      throw new Error(`PLANT_LAB_REPLAY_UNAVAILABLE:${replay.error ?? 'NOT_REPRODUCED'}`);
  }
  const aelScenario: ScenarioId = scenario === 'safe' ? 'commit-response-lost' : 'refund-stale-approval';
  const transitionIds =
    scenario === 'safe' ? SAFE_TRANSITIONS : (replayWitness?.transitionIds ?? staleWitness().transitionIds);
  return {
    scenario,
    aelScenario,
    transitionIds,
    state: createInitialState(aelScenario),
    cursor: 0,
    replayWitness,
  };
};

export const initialTraceEvents = (trace: FaultlineTrace): readonly ExecutionEvent[] => trace.state.events;

export const stepFaultlineTrace = (trace: FaultlineTrace): FaultlineStep => {
  if (trace.cursor >= trace.transitionIds.length) {
    const violation = checkAel(trace.state, true)[0] ?? null;
    return { trace, events: [], violation, complete: true };
  }
  const transitionId = trace.transitionIds[trace.cursor];
  if (!transitionId) throw new Error('PLANT_LAB_MISSING_TRANSITION');
  const transition = enabledTransitions(trace.state).find((candidate) => candidate.id === transitionId);
  if (!transition) throw new Error(`PLANT_LAB_TRANSITION_NOT_ENABLED:${transitionId}`);
  const state = applyTransition(trace.state, transition);
  const nextTrace: FaultlineTrace = { ...trace, state, cursor: trace.cursor + 1 };
  const violation = checkAel(state, nextTrace.cursor === nextTrace.transitionIds.length)[0] ?? null;
  return {
    trace: nextTrace,
    events: state.events.slice(trace.state.events.length),
    violation,
    complete: nextTrace.cursor === nextTrace.transitionIds.length,
  };
};

export const aelResultLabel = (violation: AelViolation | null): 'PASS' | 'VIOLATION' =>
  violation ? 'VIOLATION' : 'PASS';
