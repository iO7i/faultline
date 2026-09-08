import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalkingSkeletonBundle, compileSyntheticCstrFixture, runDemos } from './demo.js';
import { compareContracts } from '../../../packages/plant-contract/src/index.js';
import { parseCaseBundle, verifyCaseBundle } from '../../../packages/case-bundle/src/index.js';
import { parseSyntheticCstrEngineeringFixture } from '../../../packages/plant-ir/src/index.js';
import {
  exploreScenario,
  isScenarioId,
  parseCounterexampleCapsule,
  replayCounterexample,
  type CounterexampleCapsule,
  type ExplorationBounds,
  type ExpectedScenarioResult,
  type ScenarioId,
} from '../../../packages/counterexample/src/index.js';

const [command, subcommand, argument] = process.argv.slice(2);
const defaultBundlePath = resolve('case-bundles/cstr-walking-skeleton.case.json');
const defaultSystematicModelPath = resolve('examples/refund/faultline-model.json');
const defaultFailureDirectory = resolve('failures');
type SystematicScenario = {
  id: ScenarioId;
  expected: ExpectedScenarioResult;
  bounds: ExplorationBounds;
};
type SystematicModel = {
  schemaVersion: 'faultline.systematic-check.v1';
  model: string;
  scenarios: readonly SystematicScenario[];
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const parseSystematicModel = (value: unknown): SystematicModel | null => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 'faultline.systematic-check.v1' ||
    typeof value.model !== 'string'
  )
    return null;
  if (!Array.isArray(value.scenarios) || value.scenarios.length === 0) return null;
  const scenarios: SystematicScenario[] = [];
  for (const scenario of value.scenarios) {
    if (!isRecord(scenario) || !isScenarioId(scenario.id)) return null;
    if (scenario.expected !== 'COUNTEREXAMPLE' && scenario.expected !== 'PASS') return null;
    if (!isRecord(scenario.bounds)) return null;
    const { maxDepth, maxStates } = scenario.bounds;
    if (
      typeof maxDepth !== 'number' ||
      typeof maxStates !== 'number' ||
      !Number.isInteger(maxDepth) ||
      !Number.isInteger(maxStates) ||
      maxDepth < 1 ||
      maxStates < 1
    )
      return null;
    scenarios.push({ id: scenario.id, expected: scenario.expected, bounds: { maxDepth, maxStates } });
  }
  return { schemaVersion: 'faultline.systematic-check.v1', model: value.model, scenarios };
};
const systematicModelPathFrom = (value: string | undefined) =>
  value === undefined || value === 'examples/refund'
    ? defaultSystematicModelPath
    : resolve(value.endsWith('.json') ? value : `${value}/faultline-model.json`);
const describeTransition = (id: string) => {
  const [kind, subject = ''] = id.split(':');
  if (kind === 'dispatch') return `dispatch ${subject}`;
  if (kind === 'supersede') return 'supersede authority from R17 to R18';
  if (kind === 'commit') return `commit synthetic effect from ${subject}`;
  if (kind === 'crash') return `crash ${subject}`;
  if (kind === 'restart') return `restart ${subject}`;
  if (kind === 'drift') return `drift ${subject} to tenant-B`;
  if (kind === 'response-lost') return `lose response for ${subject}`;
  if (kind === 'response-delivered') return `deliver response for ${subject}`;
  if (kind === 'receipt') return `persist receipt for ${subject}`;
  if (kind === 'readback') return `read back ${subject}`;
  if (kind === 'retry-suppressed') return `suppress retry for ${subject}`;
  return id;
};
const selectShortest = (counterexamples: readonly CounterexampleCapsule[]) =>
  [...counterexamples].sort((left, right) => left.transitionIds.length - right.transitionIds.length)[0] ??
  null;
const serializeCounterexample = (counterexample: CounterexampleCapsule) => {
  const marker = '__FAULTLINE_TRANSITION_IDS__';
  return `${JSON.stringify({ ...counterexample, transitionIds: marker }, null, 2).replace(
    `"${marker}"`,
    `[${counterexample.transitionIds.map((id) => JSON.stringify(id)).join(', ')}]`,
  )}\n`;
};
const printSystematicCheck = (value: string | undefined) => {
  const path = systematicModelPathFrom(value);
  const model = parseSystematicModel(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (!model) throw new Error(`INVALID_SYSTEMATIC_MODEL:${path}`);
  console.log('FAULTLINE SYSTEMATIC CHECK');
  console.log(`Model:              ${model.model}`);
  console.log(`Scenarios:          ${model.scenarios.length}`);
  let passedExpectations = true;
  for (const scenario of model.scenarios) {
    const result = exploreScenario(scenario.id, scenario.bounds);
    const counterexample = selectShortest(result.counterexamples);
    const expectationMet =
      scenario.expected === 'COUNTEREXAMPLE' ? counterexample !== null : result.counterexamples.length === 0;
    passedExpectations &&= expectationMet;
    console.log('');
    console.log(`Scenario:           ${scenario.id}`);
    console.log(`Bounds:             depth=${scenario.bounds.maxDepth} states=${scenario.bounds.maxStates}`);
    console.log(`Explored states:    ${result.exploredStates}`);
    console.log(`Schedules explored: ${result.schedulesExplored}`);
    console.log(`Decisions explored: ${result.decisionsExplored}`);
    console.log(`Fault decisions:    ${result.faultDecisions}`);
    console.log(`Depth/state cutoffs:${result.cutoffStates}`);
    if (!counterexample) {
      console.log(`Result:             ${expectationMet ? 'PASS' : 'MISSING EXPECTED COUNTEREXAMPLE'}`);
      continue;
    }
    const failurePath = resolve(defaultFailureDirectory, `${counterexample.counterexampleId}.json`);
    mkdirSync(defaultFailureDirectory, { recursive: true });
    writeFileSync(failurePath, serializeCounterexample(counterexample), 'utf8');
    console.log(`Invariant:          ${counterexample.invariant}`);
    console.log(
      `Result:             ${expectationMet ? 'EXPECTED COUNTEREXAMPLE' : 'UNEXPECTED COUNTEREXAMPLE'}`,
    );
    console.log(`Counterexample:     ${failurePath}`);
    console.log('Minimal trace:');
    for (const [index, transitionId] of counterexample.transitionIds.entries())
      console.log(`  ${index + 1}. ${describeTransition(transitionId)}`);
    console.log(`Replay:             faultline replay ${failurePath}`);
  }
  if (!passedExpectations) process.exitCode = 1;
};
const printCounterexampleReplay = (value: string | undefined) => {
  if (!value) throw new Error('expected a counterexample capsule path');
  const path = resolve(value);
  const capsule = parseCounterexampleCapsule(JSON.parse(readFileSync(path, 'utf8')) as unknown);
  if (!capsule) throw new Error(`INVALID_COUNTEREXAMPLE_CAPSULE:${path}`);
  const replay = replayCounterexample(capsule);
  if (!replay.reproduced || !replay.violation) {
    console.error(`REPLAY DID NOT REPRODUCE: ${replay.error ?? 'UNKNOWN'}`);
    process.exitCode = 1;
    return;
  }
  console.log('FAULTLINE COUNTEREXAMPLE REPLAY');
  console.log(`Capsule:            ${path}`);
  console.log(`Scenario:           ${capsule.scenarioId}`);
  console.log(`Invariant:          ${replay.violation.invariant}`);
  console.log(`Violation:          ${replay.violation.code}`);
  console.log(`Events replayed:    ${replay.events.length}`);
  console.log('RESULT:             REPRODUCED');
};
const fixturePathFrom = (value: string | undefined) =>
  value === 'R17' || value === 'R18'
    ? resolve(`fixtures/cstr/engineering/${value}.json`)
    : value
      ? resolve(value)
      : null;
const compileFixtureArgument = (value: string | undefined) => {
  const path = fixturePathFrom(value);
  if (!path) throw new Error('expected an engineering fixture path or R17/R18 shorthand');
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const parsed = parseSyntheticCstrEngineeringFixture(raw);
  if (!parsed.ok) throw new Error(`INVALID_SYNTHETIC_CSTR_FIXTURE:${parsed.error}`);
  return { path, compiled: compileSyntheticCstrFixture(parsed.fixture) };
};
const writeBundle = () => {
  const bundle = createWalkingSkeletonBundle();
  writeFileSync(defaultBundlePath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  return bundle;
};
const printDemo = (scope: 'all' | 'stale-permit' | 'ambiguous-completion') => {
  const result = runDemos();
  writeBundle();
  if (scope !== 'ambiguous-completion') {
    console.log('FAULTLINE / CASE stale-permit-r17-r18');
    console.log(`contract admissibility  ADMISSIBLE_WITHIN_DECLARED_MODEL`);
    console.log(`permit                 ${result.permit.permitId} @ R17`);
    console.log(`engineering change     R17 -> R18`);
    console.log(`changed dependency     ${result.impact.changed.join(', ')}`);
    console.log(`affected               ${result.impact.affected.join(', ')}`);
    console.log(`pre-dispatch           ${result.stale.status}`);
    console.log(`reason                 ${result.stale.code}`);
    console.log(`simulator dispatches   ${result.staleEffectCount}`);
    console.log('RESULT                 PASS');
  }
  if (scope === 'all') console.log('');
  if (scope !== 'stale-permit') {
    console.log('FAULTLINE / CASE ambiguous-completion');
    console.log(`logical operation      ${result.recoveryIntent.logicalOperationId}`);
    console.log('first dispatch         SENT');
    console.log('simulator effect       APPLIED');
    console.log('acknowledgement        LOST');
    console.log(`completion state       ${result.unknown.status}`);
    console.log(`reconciliation         ${result.recovered.status}`);
    console.log('second dispatch        SUPPRESSED');
    console.log(`effect count           ${result.effectCount}`);
    console.log('readback               RECORDED');
    console.log(`outcome                ${result.outcome.status}`);
    console.log(`case bundle            ${defaultBundlePath}`);
    console.log('RESULT                 PASS');
  }
};

if (command === 'demo') {
  if (subcommand === 'stale-permit') printDemo('stale-permit');
  else if (subcommand === 'ambiguous-completion') printDemo('ambiguous-completion');
  else printDemo('all');
} else if (command === 'compile') {
  const { path, compiled } = compileFixtureArgument(subcommand);
  const { contract } = compiled;
  console.log(`Fixture        ${path}`);
  console.log(`Plant Contract ${contract.contractId}`);
  console.log(`generation      ${contract.generation}`);
  console.log(`sources         ${contract.sourceRevisions.length}`);
  console.log(`constraints     ${contract.constraints.length}`);
  console.log(`capabilities    ${contract.capabilities.length}`);
  console.log(`digest          sha256:${contract.digest}`);
} else if (command === 'contract' && subcommand === 'inspect') {
  const { path, compiled } = compileFixtureArgument(argument);
  const { contract } = compiled;
  console.log(`Fixture: ${path}`);
  console.log(`Contract: ${contract.contractId}`);
  console.log(
    `Sources: ${contract.sourceRevisions.map((source) => `${source.sourceId}@${source.revision}`).join(', ')}`,
  );
  console.log(`Provenance: ${JSON.stringify(contract.provenanceIndex)}`);
  console.log(`Monitors: ${contract.runtimeMonitors.map((monitor) => monitor.constraintId).join(', ')}`);
} else if (command === 'diff') {
  const before = compileFixtureArgument(subcommand);
  const after = compileFixtureArgument(argument);
  const impact = compareContracts(before.compiled.contract, after.compiled.contract);
  console.log(`Before: ${before.path}`);
  console.log(`After: ${after.path}`);
  console.log(`Changed: ${impact.changed.join(', ') || 'none'}`);
  console.log(`Affected: ${impact.affected.join(', ') || 'none'}`);
  console.log(`Conservative: ${impact.conservative}`);
} else if (command === 'case' && subcommand === 'verify') {
  const path = resolve(argument ?? defaultBundlePath);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const bundle = parseCaseBundle(raw);
  if (!bundle || !verifyCaseBundle(bundle)) {
    console.error(`INVALID CASE BUNDLE: ${path}`);
    process.exitCode = 1;
  } else console.log(`CASE BUNDLE VERIFIED: ${bundle.caseBundleId} (${path})`);
} else if (command === 'case' && subcommand === 'inspect') {
  const path = resolve(argument ?? defaultBundlePath);
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const bundle = parseCaseBundle(raw);
  if (!bundle) {
    console.error(`INVALID CASE BUNDLE: ${path}`);
    process.exitCode = 1;
  } else {
    console.log(`Case bundle: ${bundle.caseBundleId}`);
    console.log(`Manifest: ${bundle.manifestDigest}`);
    console.log(`Artifacts: ${Object.keys(bundle.artifacts).sort().join(', ')}`);
    console.log(`Integrity: ${verifyCaseBundle(bundle) ? 'VERIFIED' : 'INVALID'}`);
  }
} else if (command === 'check') {
  printSystematicCheck(subcommand);
} else if (command === 'replay') {
  printCounterexampleReplay(subcommand);
} else {
  console.log('usage: faultline compile <R17|R18 fixture> | faultline contract inspect <R17|R18>');
  console.log('       faultline diff R17 R18 | faultline demo [stale-permit|ambiguous-completion]');
  console.log('       faultline case verify [path] | faultline case inspect [path]');
  console.log('       faultline check [examples/refund|model.json] | faultline replay <failure.json>');
}
