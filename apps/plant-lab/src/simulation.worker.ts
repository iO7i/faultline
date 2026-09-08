/// <reference lib="webworker" />

import type { AelViolation, ExecutionEvent } from '../../../packages/counterexample/src/index.js';
import {
  createFaultlineTrace,
  initialTraceEvents,
  stepFaultlineTrace,
  type LabScenario,
} from './faultline/bridge.js';
import { createInitialPlantState, stepPlant, type PlantState } from './plant/model.js';
import {
  approveRevisedProposal,
  importIncidentCapsule,
  runIncident,
  type IncidentSession,
  type PlantIncidentExperiment,
} from './incident.js';

const TICK_MS = 100;

type WorkerCommand =
  | { type: 'start'; scenario: LabScenario }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'step' }
  | { type: 'speed'; value: 0.5 | 1 | 2 }
  | { type: 'incident-run'; experiment: PlantIncidentExperiment }
  | { type: 'incident-approve-revised' }
  | { type: 'incident-import'; capsule: unknown }
  | { type: 'dispose' };

export type SimulationSnapshot = Readonly<{
  type: 'snapshot';
  scenario: LabScenario;
  plant: PlantState;
  events: readonly ExecutionEvent[];
  allEvents: readonly ExecutionEvent[];
  violation: AelViolation | null;
  complete: boolean;
  paused: boolean;
  replay: boolean;
}>;

export type SimulationError = Readonly<{ type: 'error'; message: string }>;
export type IncidentSnapshot = Readonly<{ type: 'incident'; session: IncidentSession }>;
export type SimulationMessage = SimulationSnapshot | IncidentSnapshot | SimulationError;

let timer: number | null = null;
let speed: 0.5 | 1 | 2 = 1;
let paused = true;
let trace = createFaultlineTrace('safe');
let plant = createInitialPlantState();
let currentViolation: AelViolation | null = null;
let incident: IncidentSession | null = null;

const stopTimer = () => {
  if (timer !== null) self.clearInterval(timer);
  timer = null;
};

const post = (events: readonly ExecutionEvent[], violation: AelViolation | null, complete: boolean) => {
  const message: SimulationSnapshot = {
    type: 'snapshot',
    scenario: trace.scenario,
    plant,
    events,
    allEvents: trace.state.events,
    violation,
    complete,
    paused,
    replay: trace.scenario === 'replay',
  };
  self.postMessage(message);
};

const advance = (pauseAfter = false) => {
  if (paused) return;
  const step = stepFaultlineTrace(trace);
  trace = step.trace;
  currentViolation = step.violation;
  const sourceRevision = trace.state.currentAuthorityRevision === 18 ? 'R18' : 'R17';
  plant = stepPlant(plant, { sourceRevision, requestedFeed: 0.82, pumpCommand: 0.86 });
  if (step.complete || pauseAfter) {
    paused = true;
    stopTimer();
  }
  post(step.events, currentViolation, step.complete);
};

const schedule = () => {
  stopTimer();
  if (!paused) timer = self.setInterval(advance, TICK_MS / speed);
};

self.onmessage = (message: MessageEvent<WorkerCommand>) => {
  try {
    const command = message.data;
    if (command.type === 'start') {
      stopTimer();
      incident = null;
      trace = createFaultlineTrace(command.scenario);
      plant = stepPlant(createInitialPlantState(), { requestedFeed: 0.82, pumpCommand: 0.86 });
      currentViolation = null;
      paused = false;
      post(initialTraceEvents(trace), null, false);
      schedule();
      return;
    }
    if (command.type === 'incident-run') {
      stopTimer();
      paused = true;
      incident = runIncident(command.experiment);
      self.postMessage({ type: 'incident', session: incident } satisfies IncidentSnapshot);
      return;
    }
    if (command.type === 'incident-approve-revised') {
      if (!incident) throw new Error('PLANT_INCIDENT_NOT_STARTED');
      incident = approveRevisedProposal(incident);
      self.postMessage({ type: 'incident', session: incident } satisfies IncidentSnapshot);
      return;
    }
    if (command.type === 'incident-import') {
      stopTimer();
      paused = true;
      incident = importIncidentCapsule(command.capsule);
      self.postMessage({ type: 'incident', session: incident } satisfies IncidentSnapshot);
      return;
    }
    if (command.type === 'pause') {
      paused = true;
      stopTimer();
      post([], currentViolation, false);
      return;
    }
    if (command.type === 'resume') {
      paused = false;
      schedule();
      return;
    }
    if (command.type === 'step') {
      paused = false;
      advance(true);
      return;
    }
    if (command.type === 'speed') {
      speed = command.value;
      schedule();
      return;
    }
    stopTimer();
    self.close();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNKNOWN_SIMULATION_ERROR';
    self.postMessage({ type: 'error', message } satisfies SimulationError);
  }
};
