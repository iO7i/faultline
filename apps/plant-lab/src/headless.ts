import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  approveRevisedProposal,
  exportIncidentCapsule,
  replayIncidentCapsule,
  runIncident,
  type PlantIncidentCapsule,
} from './incident.js';

const resultFor = (capsule: PlantIncidentCapsule) => replayIncidentCapsule(capsule);

export const printPlantIncident = (capsule: PlantIncidentCapsule) => {
  const replay = resultFor(capsule);
  const unsafe = replay.session.approvalOnly;
  const safe = replay.session.revalidateAtEffectBoundary;
  console.log('PLANT LAB INCIDENT');
  console.log(`Timing:                         ${capsule.experiment.revisionTiming}`);
  console.log(`Approval-only:                  ${replay.approvalOnly}`);
  console.log(`Revalidate-at-effect-boundary:  ${replay.revalidateAtEffectBoundary}`);
  console.log(`Approval-only P-101 command:    ${unsafe.plant.pumpCommand.toFixed(2)}`);
  console.log(`Safe branch P-101 command:      ${safe.plant.pumpCommand.toFixed(2)}`);
  console.log(`Semantic digest:                 ${replay.semanticDigest}`);
};

export const readPlantIncident = (path: string): PlantIncidentCapsule =>
  JSON.parse(readFileSync(resolve(path), 'utf8')) as PlantIncidentCapsule;

const path = process.argv[2];
const capsule = path ? readPlantIncident(path) : exportIncidentCapsule(approveRevisedProposal(runIncident()));
printPlantIncident(capsule);
