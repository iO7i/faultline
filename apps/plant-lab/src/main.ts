import './styles.css';
import type { ExecutionEvent } from '../../../packages/counterexample/src/index.js';
import { equipmentById, type EquipmentId } from './plant/equipment.js';
import { createInitialPlantState, stepPlant, type PlantState } from './plant/model.js';
import { presentationFrom } from './presentation.js';
import { PlantScene } from './scene.js';
import type { LabScenario } from './faultline/bridge.js';
import type { SimulationMessage, SimulationSnapshot } from './simulation.worker.js';

type AppState = {
  plant: PlantState;
  events: readonly ExecutionEvent[];
  selected: EquipmentId;
  scenario: LabScenario | 'idle';
  violation: SimulationSnapshot['violation'];
  complete: boolean;
  paused: boolean;
  replay: boolean;
  error: string | null;
  debug: boolean;
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
  replay: false,
  error: null,
  debug: false,
};

const root = document.querySelector<HTMLDivElement>('#app');
if (!root) throw new Error('PLANT_LAB_ROOT_MISSING');

root.innerHTML = `
  <main class="plant-lab-shell">
    <header class="hero">
      <div>
        <p class="eyebrow">FAULTLINE / EXPERIMENTAL BROWSER LAB</p>
        <h1>Plant Lab <span>v0.1</span></h1>
        <p class="hero-copy">An interactive, synthetic desalination scene for replaying consequential-execution traces. It is not plant control, a digital twin, or engineering certification.</p>
      </div>
      <div class="hero-actions" aria-label="Scenario controls">
        <button class="primary" data-action="safe">RUN SAFE</button>
        <button class="warning" data-action="stale">STALE AUTHORITY</button>
        <button class="outline" data-action="replay">REPLAY COUNTEREXAMPLE</button>
      </div>
    </header>
    <section class="workbench" aria-label="Plant Lab workbench">
      <div class="scene-panel">
        <canvas id="plant-canvas" aria-label="Procedural synthetic desalination process scene"></canvas>
        <div class="scene-overlay">
          <span class="synthetic-tag">SYNTHETIC PROCESS MODEL</span>
          <button class="camera-reset" data-action="camera" aria-label="Reset plant camera">Reset view</button>
        </div>
        <div id="debug-overlay" class="debug-overlay is-hidden" aria-live="polite"></div>
      </div>
      <aside class="inspector" aria-label="Equipment inspector">
        <p class="eyebrow">EQUIPMENT INSPECTOR</p>
        <h2 id="equipment-id">P-101</h2>
        <p id="equipment-name" class="equipment-name">High-pressure pump</p>
        <p id="equipment-summary" class="muted">Action-associated pump fixture.</p>
        <dl>
          <div><dt>Source revision</dt><dd id="revision">R17 current</dd></div>
          <div><dt>Pump load</dt><dd id="pump-load">0%</dd></div>
          <div><dt>RO feed</dt><dd id="ro-feed">0.000 normalized</dd></div>
          <div><dt>Permeate</dt><dd id="permeate">0.000 normalized</dd></div>
        </dl>
        <div class="faultline-card">
          <span class="card-label">FAULTLINE RESULT</span>
          <strong id="faultline-result" data-testid="faultline-result">READY</strong>
          <p id="faultline-detail">Choose a scenario to evaluate the public synthetic AEL model.</p>
        </div>
        <button class="debug-toggle" data-action="debug">Developer diagnostics</button>
      </aside>
    </section>
    <section class="timeline-panel" aria-label="Faultline event timeline">
      <div class="timeline-title-row">
        <div><p class="eyebrow">EVENT TIMELINE</p><p id="scenario-status" class="muted">Plant ready; no trace running.</p></div>
        <div class="timeline-controls">
          <button data-action="pause">Pause</button>
          <button data-action="resume">Resume</button>
          <button data-action="restart">Restart</button>
          <button data-action="step">Step</button>
          <label>Speed <select id="speed"><option value="0.5">0.5x</option><option value="1" selected>1x</option><option value="2">2x</option></select></label>
        </div>
      </div>
      <ol id="timeline" class="timeline" data-testid="timeline"><li class="timeline-empty">Run a scenario to populate its semantic events.</li></ol>
    </section>
    <footer>Plant Lab uses procedural geometry only. Important state is available as text; the 3D scene is supplemental.</footer>
  </main>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#plant-canvas');
if (!canvas) throw new Error('PLANT_LAB_CANVAS_MISSING');

let scene: PlantScene | null = null;
let worker: Worker | null = null;

const text = (selector: string, value: string) => {
  const element = document.querySelector<HTMLElement>(selector);
  if (element) element.textContent = value;
};

const eventLabel = (event: ExecutionEvent) => {
  if (event.type === 'AuthorityGranted') return 'Authority R17';
  if (event.type === 'AuthoritySuperseded') return 'Authority R18 current';
  if (event.type === 'EffectCommitted') return 'Effect committed';
  if (event.type === 'DispatchStarted') return 'Dispatch started';
  if (event.type === 'ResponseLost') return 'Acknowledgement lost';
  if (event.type === 'ReadbackObserved') return 'Readback reconciled';
  return event.type.replaceAll(/([a-z])([A-Z])/g, '$1 $2');
};

const renderTimeline = () => {
  const timeline = document.querySelector<HTMLOListElement>('#timeline');
  if (!timeline) return;
  timeline.replaceChildren();
  const items: Array<{ id: string; label: string; detail: string; isViolation?: boolean }> = state.events.map(
    (event) => ({
      id: event.eventId,
      label: eventLabel(event),
      detail: event.detail,
    }),
  );
  if (state.violation)
    items.push({
      id: `violation-${state.violation.invariant}`,
      label: 'I3 stale authority',
      detail: state.violation.message,
      isViolation: true,
    });
  if (items.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'timeline-empty';
    empty.textContent = 'Run a scenario to populate its semantic events.';
    timeline.append(empty);
    return;
  }
  for (const item of items) {
    const listItem = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = item.isViolation ? 'timeline-event violation' : 'timeline-event';
    button.dataset.eventId = item.id;
    button.innerHTML = `<span>${item.label}</span><small>${item.detail}</small>`;
    button.addEventListener('click', () => {
      selectEquipment('P-101');
      worker?.postMessage({ type: 'pause' });
    });
    listItem.append(button);
    timeline.append(listItem);
  }
};

const render = () => {
  const spec = equipmentById(state.selected);
  text('#equipment-id', spec.id);
  text('#equipment-name', spec.name);
  text('#equipment-summary', spec.summary);
  text('#revision', `R17 approved • ${state.plant.sourceRevision} current`);
  text('#pump-load', `${Math.round(state.plant.pumpLoad * 100)}%`);
  text('#ro-feed', `${state.plant.roFeedFlow.toFixed(3)} normalized`);
  text('#permeate', `${state.plant.permeateFlow.toFixed(3)} normalized`);
  const result = state.error
    ? 'REPLAY UNAVAILABLE'
    : state.violation
      ? 'VIOLATION • I3'
      : state.complete
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
      state.violation || state.error ? 'result-violation' : state.complete ? 'result-pass' : '';
  }
  text(
    '#faultline-detail',
    state.error ??
      (state.violation
        ? 'I3_STALE_AUTHORITY_CANNOT_COMMIT: P-101 is the visual scope for the real synthetic AEL result.'
        : state.complete
          ? 'The real synthetic AEL trace completed without an invariant violation.'
          : 'The event stream is evaluated by the public AEL checker.'),
  );
  text(
    '#scenario-status',
    state.error
      ? state.error
      : state.scenario === 'idle'
        ? 'Plant ready; no trace running.'
        : `${state.replay ? 'Minimized witness replay' : `${state.scenario} trace`} • tick ${state.plant.tick} • ${state.paused ? 'paused' : 'running'}`,
  );
  scene?.update(presentationFrom(state.plant, state.events, state.violation, state.selected));
  renderTimeline();
};

const selectEquipment = (id: EquipmentId) => {
  state.selected = id;
  render();
};

const start = (scenario: LabScenario) => {
  state.plant = initialPlant();
  state.events = [];
  state.selected = 'P-101';
  state.scenario = scenario;
  state.violation = null;
  state.complete = false;
  state.paused = false;
  state.replay = scenario === 'replay';
  state.error = null;
  scene?.resetCamera();
  worker?.postMessage({ type: 'start', scenario });
  render();
};

const receive = (message: MessageEvent<SimulationMessage>) => {
  if (message.data.type === 'error') {
    state.error = message.data.message;
    state.paused = true;
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
  state.replay = snapshot.replay;
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

document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach((button) => {
  button.addEventListener('click', () => {
    const action = button.dataset.action;
    if (action === 'safe') start('safe');
    if (action === 'stale') start('stale');
    if (action === 'replay') start('replay');
    if (action === 'camera') scene?.resetCamera();
    if (action === 'pause') worker?.postMessage({ type: 'pause' });
    if (action === 'resume') worker?.postMessage({ type: 'resume' });
    if (action === 'step') worker?.postMessage({ type: 'step' });
    if (action === 'restart' && state.scenario !== 'idle') start(state.scenario);
    if (action === 'debug') {
      state.debug = !state.debug;
      document.querySelector('#debug-overlay')?.classList.toggle('is-hidden', !state.debug);
    }
  });
});

document.querySelector<HTMLSelectElement>('#speed')?.addEventListener('change', (event) => {
  const value = Number((event.target as HTMLSelectElement).value) as 0.5 | 1 | 2;
  worker?.postMessage({ type: 'speed', value });
});

const diagnosticsTimer = window.setInterval(() => {
  if (!state.debug || !scene) return;
  text(
    '#debug-overlay',
    `FPS ${scene.diagnostics().fps} • meshes ${scene.diagnostics().meshes} • tick ${state.plant.tick} • ${state.selected} • ${state.scenario}`,
  );
}, 500);

let resumeAfterVisibility = false;
const visibilityHandler = () => {
  if (document.hidden) {
    resumeAfterVisibility = !state.paused && !state.complete;
    if (resumeAfterVisibility) worker?.postMessage({ type: 'pause' });
    return;
  }
  if (resumeAfterVisibility && !state.complete) worker?.postMessage({ type: 'resume' });
  resumeAfterVisibility = false;
};
document.addEventListener('visibilitychange', visibilityHandler);

window.addEventListener('beforeunload', () => {
  window.clearInterval(diagnosticsTimer);
  document.removeEventListener('visibilitychange', visibilityHandler);
  worker?.postMessage({ type: 'dispose' });
  worker?.terminate();
  scene?.dispose();
});
