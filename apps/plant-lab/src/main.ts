import './styles.css';
import type { ExecutionEvent } from '../../../packages/counterexample/src/index.js';
import {
  exportIncidentCapsule,
  firstViolatingEvent,
  type IncidentBranch,
  type IncidentEvent,
  type IncidentSession,
  type RevisionTiming,
} from './incident.js';
import { equipmentById, EQUIPMENT, PROCESS_CONNECTIONS, type EquipmentId } from './plant/equipment.js';
import { createInitialPlantState, stepPlant, type PlantState } from './plant/model.js';
import { presentationFrom } from './presentation.js';
import { PlantScene, type PlantCameraState } from './scene.js';
import type { LabScenario } from './faultline/bridge.js';
import type { IncidentSnapshot, SimulationMessage, SimulationSnapshot } from './simulation.worker.js';

type ActivePolicy = 'approval-only' | 'revalidate-at-effect-boundary';
type AppState = {
  plant: PlantState;
  events: readonly ExecutionEvent[];
  selected: EquipmentId;
  scenario: LabScenario | 'idle';
  violation: SimulationSnapshot['violation'];
  complete: boolean;
  paused: boolean;
  error: string | null;
  debug: boolean;
  incident: IncidentSession | null;
  comparing: boolean;
  activePolicy: ActivePolicy;
  selectedEventId: string | null;
};

const initialPlant = () => stepPlant(createInitialPlantState(), { requestedFeed: 0.82, pumpCommand: 0.86 });
const state: AppState = {
  plant: initialPlant(),
  events: [],
  selected: 'P-101',
  scenario: 'idle',
  violation: null,
  complete: false,
  paused: true,
  error: null,
  debug: false,
  incident: null,
  comparing: false,
  activePolicy: 'approval-only',
  selectedEventId: null,
};
const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('PLANT_LAB_ROOT_MISSING');

root.innerHTML = `
  <main class="plant-lab-shell">
    <header class="hero">
      <div><p class="eyebrow">FAULTLINE / REPLAYABLE INCIDENT WORKBENCH</p><h1>Plant Lab <span>v0.2</span></h1><p class="hero-copy">A synthetic P-101 authority-race experiment. Normalized commands are demonstration values, not pump limits, plant control, or engineering certification.</p></div>
      <div class="hero-actions" aria-label="Scenario controls">
        <label class="control-label">Revision timing <select id="revision-timing" data-testid="revision-timing"><option value="before-approval">Before approval</option><option value="after-approval-before-effect" selected>After approval / before effect</option><option value="after-valid-effect">After valid effect</option></select></label>
        <button class="primary" data-action="incident-run" data-testid="run-experiment">RUN EXPERIMENT</button><button class="outline incident-only is-hidden" data-action="compare" data-testid="compare-policies">COMPARE EXECUTION POLICIES</button><button class="outline incident-only is-hidden" data-action="toggle-policy">TOGGLE A / B</button><button class="warning incident-only is-hidden" data-action="approve" data-testid="approve-revised">APPROVE REVISED PROPOSAL</button><button class="outline incident-only is-hidden" data-action="replay-witness">REPLAY WITNESS</button><button class="outline incident-only is-hidden" data-action="export">EXPORT INCIDENT</button><label class="outline file-control incident-only is-hidden">LOAD INCIDENT<input id="incident-file" type="file" accept="application/json,.json" /></label>
        <button class="outline v1-control" data-action="safe">RUN SAFE</button><button class="warning v1-control" data-action="stale">STALE AUTHORITY</button><button class="outline v1-control" data-action="replay">REPLAY COUNTEREXAMPLE</button>
      </div>
    </header>
    <section class="incident-summary incident-only is-hidden" aria-live="polite"><button id="approval-only-card" class="policy-card unsafe" data-policy="approval-only"><p class="eyebrow">APPROVAL-TIME ONLY</p><strong id="approval-only-result">WAITING</strong><span id="approval-only-detail"></span></button><button id="guarded-card" class="policy-card safe" data-policy="revalidate-at-effect-boundary"><p class="eyebrow">REVALIDATE AT EFFECT BOUNDARY</p><strong id="guarded-result">WAITING</strong><span id="guarded-detail"></span></button><p class="compare-basis">SAME CHECKPOINT · SAME R18 EVENT · DIFFERENT EXECUTION POLICY</p></section>
    <section class="workbench" aria-label="Plant Lab workbench"><div class="scene-panel" id="scene-panel"><canvas id="plant-canvas" aria-label="Procedural synthetic desalination process scene"></canvas><div id="compare-scenes" class="compare-scenes is-hidden" aria-label="Synchronized policy comparison"></div><div class="scene-overlay"><span class="synthetic-tag">SYNTHETIC PROCESS MODEL</span><button class="camera-reset" data-action="camera">Reset view</button></div><div id="debug-overlay" class="debug-overlay is-hidden" aria-live="polite"></div></div><aside class="inspector" aria-label="Equipment inspector"><p class="eyebrow">EQUIPMENT INSPECTOR</p><h2 id="equipment-id">P-101</h2><p id="equipment-name" class="equipment-name">High-pressure pump</p><p id="equipment-summary" class="muted">Action-associated pump fixture.</p><dl><div><dt>Current revision</dt><dd id="revision">R17</dd></div><div><dt>P-101 command</dt><dd id="pump-command">0.86</dd></div><div><dt>Pump load</dt><dd id="pump-load">0%</dd></div><div><dt>RO feed</dt><dd id="ro-feed">0.000 normalized</dd></div><div><dt>Permeate</dt><dd id="permeate">0.000 normalized</dd></div></dl><div class="faultline-card"><span class="card-label">FAULTLINE RESULT</span><strong id="faultline-result" data-testid="faultline-result">READY</strong><p id="faultline-detail">Choose a scenario to evaluate the public synthetic AEL model.</p></div><div id="incident-evidence" class="incident-evidence is-hidden"></div><button class="debug-toggle" data-action="debug">Developer diagnostics</button></aside></section>
    <section class="schematic-panel incident-only is-hidden" aria-label="Process schematic"><div><p class="eyebrow">PROCESS SCHEMATIC</p><p class="muted">Generated from the equipment registry and process connections.</p></div><svg id="process-schematic" viewBox="0 0 720 180" role="img" aria-label="Synthetic desalination process schematic"></svg></section>
    <section class="timeline-panel" aria-label="Faultline evidence timeline"><div class="timeline-title-row"><div><p class="eyebrow">EVIDENCE TIMELINE</p><p id="scenario-status" class="muted">Plant ready; no trace running.</p></div><div class="timeline-controls"><button class="incident-only is-hidden" data-action="first-violation">JUMP TO FIRST VIOLATION</button><button data-action="pause">Pause</button><button data-action="resume">Resume</button><button data-action="step">Step</button><label class="v1-control">Speed <select id="speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select></label></div></div><ol id="timeline" class="timeline" data-testid="timeline"><li class="timeline-empty">Run a scenario to populate its semantic events.</li></ol></section>
    <textarea id="capsule-preview" class="is-hidden" aria-label="Exported incident capsule" readonly></textarea>
    <footer>The browser simulator models authority revalidation and effect commit as one deterministic transition. This demonstrates the intended correctness boundary; it does not establish atomicity for arbitrary distributed services or physical controllers.</footer>
  </main>`;

const canvas = document.querySelector<HTMLCanvasElement>('#plant-canvas');
if (!canvas) throw new Error('PLANT_LAB_CANVAS_MISSING');
let scene: PlantScene | null = null;
let branchScenes: Partial<Record<ActivePolicy, PlantScene>> = {};
let worker: Worker | null = null;
let syncingCamera = false;
const text = (selector: string, value: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
};
const branchFor = (policy = state.activePolicy): IncidentBranch | null =>
  !state.incident
    ? null
    : policy === 'approval-only'
      ? state.incident.approvalOnly
      : state.incident.revalidateAtEffectBoundary;
const currentPlant = () => branchFor()?.plant ?? state.plant;
const currentViolation = () => branchFor()?.violation ?? state.violation;
const currentEvents = (): readonly IncidentEvent[] | readonly ExecutionEvent[] =>
  branchFor()?.events ?? state.events;
const eventLabel = (event: IncidentEvent | ExecutionEvent) => {
  if ('kind' in event) return event.kind.replaceAll(/([a-z])([A-Z])/g, '$1 $2');
  if (event.type === 'AuthorityGranted') return 'Authority R17';
  if (event.type === 'AuthoritySuperseded') return 'Authority R18 current';
  return event.type.replaceAll(/([a-z])([A-Z])/g, '$1 $2');
};
const selectEquipment = (id: EquipmentId) => {
  state.selected = id;
  scene?.focus(id);
  Object.values(branchScenes).forEach((item) => item?.focus(id));
  render();
};
const selectedIncidentEvent = (): IncidentEvent | null =>
  branchFor()?.events.find((event) => event.eventId === state.selectedEventId) ?? null;

const renderTimeline = () => {
  const timeline = document.querySelector<HTMLOListElement>('#timeline');
  if (!timeline) return;
  timeline.replaceChildren();
  const events = currentEvents();
  if (events.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'timeline-empty';
    empty.textContent = 'Run a scenario to populate its semantic events.';
    timeline.append(empty);
    return;
  }
  for (const event of events) {
    const incidentEvent = 'kind' in event ? event : null;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `timeline-event ${incidentEvent?.kind === 'FaultlineFinding' ? 'violation' : ''}`;
    button.dataset.eventId = event.eventId;
    button.innerHTML = `<span>T${event.logicalTime} · ${eventLabel(event)}</span><small>${event.detail}</small>`;
    button.addEventListener('click', () => {
      state.selectedEventId = event.eventId;
      selectEquipment('P-101');
    });
    const item = document.createElement('li');
    item.append(button);
    timeline.append(item);
  }
  if (!branchFor() && state.violation) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'timeline-event violation';
    button.innerHTML = `<span>I3 stale authority</span><small>${state.violation.message}</small>`;
    button.addEventListener('click', () => selectEquipment('P-101'));
    item.append(button);
    timeline.append(item);
  }
};

const renderSchematic = () => {
  const svg = document.querySelector<SVGSVGElement>('#process-schematic');
  if (!svg) return;
  svg.replaceChildren();
  const ns = 'http://www.w3.org/2000/svg';
  const point = (id: EquipmentId) => {
    const schematic = equipmentById(id).schematic;
    return { x: 55 + schematic.column * 118, y: 82 + (schematic.row - 1) * 55 };
  };
  for (const connection of PROCESS_CONNECTIONS) {
    const from = point(connection.from);
    const to = point(connection.to);
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', String(from.x));
    line.setAttribute('y1', String(from.y));
    line.setAttribute('x2', String(to.x));
    line.setAttribute('y2', String(to.y));
    line.setAttribute('class', `stream-${connection.stream}`);
    svg.append(line);
  }
  for (const equipment of EQUIPMENT.filter((item) => item.id !== 'CB-01')) {
    const p = point(equipment.id);
    const group = document.createElementNS(ns, 'g');
    group.setAttribute('class', `schematic-node ${state.selected === equipment.id ? 'selected' : ''}`);
    group.setAttribute('tabindex', '0');
    group.setAttribute('role', 'button');
    group.setAttribute('aria-label', `Select ${equipment.id}`);
    const box = document.createElementNS(ns, 'rect');
    box.setAttribute('x', String(p.x - 39));
    box.setAttribute('y', String(p.y - 16));
    box.setAttribute('width', '78');
    box.setAttribute('height', '32');
    box.setAttribute('rx', '5');
    const label = document.createElementNS(ns, 'text');
    label.setAttribute('x', String(p.x));
    label.setAttribute('y', String(p.y + 5));
    label.setAttribute('text-anchor', 'middle');
    label.textContent = equipment.id;
    group.append(box, label);
    group.addEventListener('click', () => selectEquipment(equipment.id));
    group.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') selectEquipment(equipment.id);
    });
    svg.append(group);
  }
};

const scenePresentation = (branch: IncidentBranch | null) =>
  presentationFrom(
    branch?.plant ?? state.plant,
    branch?.aelEvents ?? state.events,
    branch?.violation ?? state.violation,
    state.selected,
  );
const syncCamera = (source: ActivePolicy, camera: PlantCameraState) => {
  if (syncingCamera) return;
  syncingCamera = true;
  const other: ActivePolicy = source === 'approval-only' ? 'revalidate-at-effect-boundary' : 'approval-only';
  branchScenes[other]?.setCamera(camera);
  syncingCamera = false;
};
const disposeBranchScenes = () => {
  Object.values(branchScenes).forEach((item) => item?.dispose());
  branchScenes = {};
  document.querySelector('#compare-scenes')?.replaceChildren();
};
const mountComparison = () => {
  const holder = document.querySelector<HTMLDivElement>('#compare-scenes');
  if (!holder || !state.incident) return;
  disposeBranchScenes();
  scene?.dispose();
  scene = null;
  canvas.classList.add('is-hidden');
  holder.classList.remove('is-hidden');
  for (const policy of ['approval-only', 'revalidate-at-effect-boundary'] as const) {
    const wrap = document.createElement('div');
    wrap.className = `compare-scene ${policy}`;
    wrap.innerHTML = `<p>${policy === 'approval-only' ? 'APPROVAL-TIME ONLY' : 'REVALIDATE AT EFFECT BOUNDARY'}</p>`;
    const branchCanvas = document.createElement('canvas');
    branchCanvas.ariaLabel = `${policy} synthetic plant scene`;
    wrap.append(branchCanvas);
    holder.append(wrap);
    branchScenes[policy] = new PlantScene(branchCanvas, selectEquipment, (camera) =>
      syncCamera(policy, camera),
    );
  }
};
const endComparison = () => {
  disposeBranchScenes();
  document.querySelector('#compare-scenes')?.classList.add('is-hidden');
  canvas.classList.remove('is-hidden');
  if (!scene) scene = new PlantScene(canvas, selectEquipment);
};

const renderIncidentCards = (session: IncidentSession) => {
  const approval = session.approvalOnly;
  const guarded = session.revalidateAtEffectBoundary;
  text('#approval-only-result', approval.violation ? 'I3 VIOLATION' : 'PASS');
  text(
    '#approval-only-detail',
    `P-101 ${approval.plant.pumpCommand.toFixed(2)} · R17 used · ${approval.currentRevision} current`,
  );
  text(
    '#guarded-result',
    guarded.status === 'rejected-stale' ? 'STALE 0.70 REJECTED' : guarded.violation ? 'I3 VIOLATION' : 'PASS',
  );
  text(
    '#guarded-detail',
    `P-101 ${guarded.plant.pumpCommand.toFixed(2)} · current ${guarded.currentRevision}`,
  );
};
const renderEvidence = (branch: IncidentBranch) => {
  const target = document.querySelector<HTMLElement>('#incident-evidence');
  if (!target) return;
  target.classList.remove('is-hidden');
  const event = selectedIncidentEvent() ?? firstViolatingEvent(branch) ?? branch.events.at(-1) ?? null;
  const effect = branch.effects.at(-1);
  target.innerHTML = `<span class="card-label">INCIDENT EVIDENCE</span><p>Action: <strong>pump.command.set</strong></p><p>Requested: <strong>${(event?.command ?? branch.pendingOperation?.arguments.command ?? 0).toFixed(2)}</strong></p><p>Authorized: <strong>${effect?.authorityRevision ?? branch.pendingOperation?.authorityRevision ?? 'R17'}</strong></p><p>Current at commit: <strong>${effect?.currentRevisionAtCommit ?? branch.currentRevision}</strong></p><p>Observed command: <strong>${branch.plant.pumpCommand.toFixed(2)}</strong></p><p>Faultline: <strong>${branch.violation?.invariant ?? (branch.status === 'rejected-stale' ? 'STALE REJECTED' : 'PASS')}</strong></p>`;
};

const render = () => {
  const branch = branchFor();
  const plant = currentPlant();
  const spec = equipmentById(state.selected);
  text('#equipment-id', spec.id);
  text('#equipment-name', spec.name);
  text('#equipment-summary', spec.summary);
  text(
    '#revision',
    branch ? `${branch.currentRevision} current` : `R17 approved · ${plant.sourceRevision} current`,
  );
  text('#pump-command', plant.pumpCommand.toFixed(2));
  text('#pump-load', `${Math.round(plant.pumpLoad * 100)}%`);
  text('#ro-feed', `${plant.roFeedFlow.toFixed(3)} normalized`);
  text('#permeate', `${plant.permeateFlow.toFixed(3)} normalized`);
  const violation = currentViolation();
  const result = state.error
    ? 'REPLAY UNAVAILABLE'
    : violation
      ? 'VIOLATION • I3'
      : branch?.status === 'rejected-stale'
        ? 'STALE WORK REJECTED'
        : branch?.status === 'pass' || state.complete
          ? 'PASS'
          : state.scenario === 'idle'
            ? 'READY'
            : state.paused
              ? 'PAUSED'
              : 'RUNNING';
  const resultElement = document.querySelector<HTMLElement>('#faultline-result');
  if (resultElement) {
    resultElement.textContent = result;
    resultElement.className =
      violation || state.error
        ? 'result-violation'
        : branch?.status === 'rejected-stale'
          ? 'result-pending'
          : state.complete || branch?.status === 'pass'
            ? 'result-pass'
            : '';
  }
  text(
    '#faultline-detail',
    state.error ??
      (violation
        ? 'AEL established I3 from the committed effect’s R17 authority and R18 current basis.'
        : branch?.status === 'rejected-stale'
          ? 'The final authority check and simulated commit are one deterministic transition.'
          : branch
            ? 'Faultline evaluates this branch’s evidence independently of the policy label.'
            : 'Choose a scenario to evaluate the public synthetic AEL model.'),
  );
  text(
    '#scenario-status',
    branch
      ? `${state.incident?.experiment.revisionTiming} · logical time T${branch.events.at(-1)?.logicalTime ?? 0} · ${state.activePolicy}`
      : state.scenario === 'idle'
        ? 'Plant ready; no trace running.'
        : `${state.scenario === 'replay' ? 'Minimized witness replay' : `${state.scenario} trace`} · tick ${plant.tick} · ${state.paused ? 'paused' : 'running'}`,
  );
  if (state.incident) {
    document.querySelectorAll('.incident-only').forEach((node) => node.classList.remove('is-hidden'));
    document.querySelectorAll('.v1-control').forEach((node) => node.classList.add('is-hidden'));
    renderIncidentCards(state.incident);
    renderEvidence(branch!);
    renderSchematic();
    document
      .querySelector<HTMLButtonElement>('[data-action="approve"]')
      ?.classList.toggle('is-hidden', state.incident.revalidateAtEffectBoundary.status !== 'rejected-stale');
  } else {
    document.querySelectorAll('.incident-only').forEach((node) => node.classList.add('is-hidden'));
    document.querySelectorAll('.v1-control').forEach((node) => node.classList.remove('is-hidden'));
    document.querySelector('#incident-evidence')?.classList.add('is-hidden');
  }
  scene?.update(scenePresentation(branch));
  branchScenes['approval-only']?.update(scenePresentation(state.incident?.approvalOnly ?? null));
  branchScenes['revalidate-at-effect-boundary']?.update(
    scenePresentation(state.incident?.revalidateAtEffectBoundary ?? null),
  );
  renderTimeline();
};

const startV1 = (scenario: LabScenario) => {
  state.incident = null;
  state.comparing = false;
  endComparison();
  state.plant = initialPlant();
  state.events = [];
  state.selected = 'P-101';
  state.scenario = scenario;
  state.violation = null;
  state.complete = false;
  state.paused = false;
  state.error = null;
  scene?.resetCamera();
  worker?.postMessage({ type: 'start', scenario });
  render();
};
const startIncident = () => {
  const revisionTiming = (document.querySelector<HTMLSelectElement>('#revision-timing')?.value ??
    'after-approval-before-effect') as RevisionTiming;
  state.incident = null;
  state.comparing = false;
  endComparison();
  state.selected = 'P-101';
  state.selectedEventId = null;
  state.error = null;
  worker?.postMessage({
    type: 'incident-run',
    experiment: {
      scenarioVersion: 'faultline.plant-incident.v0.2',
      equipmentId: 'P-101',
      initialCommand: 0.4,
      proposedCommand: 0.7,
      revisedCommand: 0.5,
      revisionTiming,
      revisions: { R17: { maxCommand: 0.8 }, R18: { maxCommand: 0.55 } },
    },
  });
};
const receive = (message: MessageEvent<SimulationMessage>) => {
  if (message.data.type === 'error') {
    state.error = message.data.message;
    state.paused = true;
    render();
    return;
  }
  if (message.data.type === 'incident') {
    state.incident = (message.data as IncidentSnapshot).session;
    state.scenario = 'idle';
    state.paused = true;
    state.complete = true;
    state.activePolicy = 'approval-only';
    render();
    return;
  }
  const snapshot = message.data;
  state.plant = snapshot.plant;
  state.events = snapshot.allEvents;
  state.scenario = snapshot.scenario;
  state.violation = snapshot.violation;
  state.complete = snapshot.complete;
  state.paused = snapshot.paused;
  if (snapshot.violation) state.selected = 'P-101';
  render();
};

try {
  scene = new PlantScene(canvas, selectEquipment);
  worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', receive);
  render();
} catch (error) {
  state.error = error instanceof Error ? error.message : 'WEBGL_INITIALIZATION_FAILED';
  render();
}
document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) =>
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'safe') startV1('safe');
    if (action === 'stale') startV1('stale');
    if (action === 'replay') startV1('replay');
    if (action === 'incident-run') startIncident();
    if (action === 'compare' && state.incident) {
      state.comparing = true;
      mountComparison();
      render();
    }
    if (action === 'toggle-policy' && state.incident) {
      state.activePolicy =
        state.activePolicy === 'approval-only' ? 'revalidate-at-effect-boundary' : 'approval-only';
      render();
    }
    if (action === 'approve') worker?.postMessage({ type: 'incident-approve-revised' });
    if (action === 'camera') {
      scene?.resetCamera();
      Object.values(branchScenes).forEach((item) => item?.resetCamera());
    }
    if (action === 'pause') worker?.postMessage({ type: 'pause' });
    if (action === 'resume') worker?.postMessage({ type: 'resume' });
    if (action === 'step') worker?.postMessage({ type: 'step' });
    if (action === 'debug') {
      state.debug = !state.debug;
      document.querySelector('#debug-overlay')?.classList.toggle('is-hidden', !state.debug);
    }
    if (action === 'first-violation') {
      const branch = branchFor('approval-only');
      const event = branch && firstViolatingEvent(branch);
      if (event) {
        state.activePolicy = 'approval-only';
        state.selectedEventId = event.eventId;
        selectEquipment('P-101');
      }
    }
    if (action === 'replay-witness' && state.incident) {
      state.activePolicy = 'approval-only';
      state.selectedEventId = firstViolatingEvent(state.incident.approvalOnly)?.eventId ?? null;
      selectEquipment('P-101');
    }
    if (action === 'export' && state.incident) {
      const json = JSON.stringify(exportIncidentCapsule(state.incident), null, 2);
      const preview = document.querySelector<HTMLTextAreaElement>('#capsule-preview');
      if (preview) {
        preview.value = json;
        preview.classList.remove('is-hidden');
      }
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
      link.download = 'faultline-plant-incident.json';
      link.click();
      URL.revokeObjectURL(link.href);
    }
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-policy]').forEach((button) =>
  button.addEventListener('click', () => {
    state.activePolicy = button.dataset.policy as ActivePolicy;
    selectEquipment('P-101');
  }),
);
document.querySelector<HTMLSelectElement>('#speed')?.addEventListener('change', (event) =>
  worker?.postMessage({
    type: 'speed',
    value: Number((event.target as HTMLSelectElement).value) as 0.5 | 1 | 2,
  }),
);
document.querySelector<HTMLInputElement>('#incident-file')?.addEventListener('change', async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    worker?.postMessage({ type: 'incident-import', capsule: JSON.parse(await file.text()) });
  } catch {
    state.error = 'INVALID_PLANT_INCIDENT_FILE';
    render();
  }
});
const diagnosticsTimer = window.setInterval(() => {
  if (!state.debug) return;
  const diagnostics = scene?.diagnostics() ?? branchScenes['approval-only']?.diagnostics();
  if (diagnostics)
    text(
      '#debug-overlay',
      `FPS ${diagnostics.fps} · meshes ${diagnostics.meshes} · ${state.selected} · ${state.comparing ? 'comparison' : 'single'}`,
    );
}, 500);
window.addEventListener('beforeunload', () => {
  window.clearInterval(diagnosticsTimer);
  worker?.postMessage({ type: 'dispose' });
  worker?.terminate();
  scene?.dispose();
  disposeBranchScenes();
});
