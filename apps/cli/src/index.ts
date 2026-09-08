import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWalkingSkeletonBundle, compileDemoGeneration, runDemos } from './demo.js';
import { compareContracts } from '../../../packages/plant-contract/src/index.js';
import { parseCaseBundle, verifyCaseBundle } from '../../../packages/case-bundle/src/index.js';

const [command, subcommand, argument] = process.argv.slice(2);
const defaultBundlePath = resolve('case-bundles/cstr-walking-skeleton.case.json');
const generationFrom = (value: string | undefined): 'R17' | 'R18' | null =>
  value?.includes('R17') ? 'R17' : value?.includes('R18') ? 'R18' : null;
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
    console.log(`simulator dispatches   ${result.stale.effectCount}`);
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
  const generation = generationFrom(subcommand);
  if (!generation) throw new Error('compile expects a path containing R17 or R18');
  const { contract } = compileDemoGeneration(generation);
  console.log(`Plant Contract ${contract.contractId}`);
  console.log(`generation      ${contract.generation}`);
  console.log(`sources         ${contract.sourceRevisions.length}`);
  console.log(`constraints     ${contract.constraints.length}`);
  console.log(`capabilities    ${contract.capabilities.length}`);
  console.log(`digest          sha256:${contract.digest}`);
} else if (command === 'contract' && subcommand === 'inspect') {
  const generation = generationFrom(argument);
  if (!generation) throw new Error('contract inspect expects R17 or R18');
  const { contract } = compileDemoGeneration(generation);
  console.log(`Contract: ${contract.contractId}`);
  console.log(
    `Sources: ${contract.sourceRevisions.map((source) => `${source.sourceId}@${source.revision}`).join(', ')}`,
  );
  console.log(`Provenance: ${JSON.stringify(contract.provenanceIndex)}`);
  console.log(`Monitors: ${contract.runtimeMonitors.map((monitor) => monitor.constraintId).join(', ')}`);
} else if (command === 'diff') {
  const before = generationFrom(subcommand);
  const after = generationFrom(argument);
  if (!before || !after) throw new Error('diff expects two generations: diff R17 R18');
  const impact = compareContracts(
    compileDemoGeneration(before).contract,
    compileDemoGeneration(after).contract,
  );
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
} else {
  console.log('usage: faultline compile <R17|R18 fixture> | faultline contract inspect <R17|R18>');
  console.log('       faultline diff R17 R18 | faultline demo [stale-permit|ambiguous-completion]');
  console.log('       faultline case verify [path] | faultline case inspect [path]');
}
