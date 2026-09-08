import { describe, expect, it } from 'vitest';
import {
  approveRevisedProposal,
  createIncidentExperiment,
  exportIncidentCapsule,
  firstViolatingEvent,
  importIncidentCapsule,
  incidentSemanticDigest,
  replayIncidentCapsule,
  runIncident,
} from './incident.js';

describe('Plant Lab replayable P-101 incident', () => {
  it('uses one native P-101 action and lets the unchanged AEL checker expose the stale effect', () => {
    const session = runIncident();
    const unsafe = session.approvalOnly;
    expect(unsafe.operations[0]).toMatchObject({
      operationId: 'pump-command:P-101:001',
      action: 'pump.command.set',
      target: 'P-101',
      arguments: { command: 0.7 },
    });
    expect(unsafe.plant.pumpCommand).toBe(0.7);
    expect(unsafe.violation?.invariant).toBe('I3_STALE_AUTHORITY_CANNOT_COMMIT');
    expect(firstViolatingEvent(unsafe)).toMatchObject({
      revision: 'R17',
      currentRevisionAtCommit: 'R18',
      command: 0.7,
    });
  });

  it('uses the same checkpoint and leaves the guarded branch at 0.40 until a fresh R18 operation', () => {
    const session = runIncident();
    expect(session.approvalOnly.checkpointId).toBe(session.revalidateAtEffectBoundary.checkpointId);
    expect(session.revalidateAtEffectBoundary.status).toBe('rejected-stale');
    expect(session.revalidateAtEffectBoundary.plant.pumpCommand).toBe(0.4);
    const after = approveRevisedProposal(session);
    expect(after.revalidateAtEffectBoundary.plant.pumpCommand).toBe(0.5);
    expect(after.revalidateAtEffectBoundary.violation).toBeNull();
    expect(after.approvalOnly.violation?.invariant).toBe('I3_STALE_AUTHORITY_CANNOT_COMMIT');
    expect(after.approvalOnly.plant.roFeedFlow).toBeGreaterThan(
      session.revalidateAtEffectBoundary.plant.roFeedFlow,
    );
    expect(after.revalidateAtEffectBoundary.plant.roFeedFlow).toBeGreaterThan(
      session.revalidateAtEffectBoundary.plant.roFeedFlow,
    );
  });

  it.each([
    ['before-approval', 'pass', 'pass', 0.5, 0.5],
    ['after-valid-effect', 'pass', 'pass', 0.7, 0.7],
  ] as const)(
    'keeps %s correct for both policies',
    (revisionTiming, approval, guarded, unsafeCommand, safeCommand) => {
      const session = runIncident(createIncidentExperiment({ revisionTiming }));
      expect(session.approvalOnly.status).toBe(approval);
      expect(session.revalidateAtEffectBoundary.status).toBe(guarded);
      expect(session.approvalOnly.violation).toBeNull();
      expect(session.revalidateAtEffectBoundary.violation).toBeNull();
      expect(session.approvalOnly.plant.pumpCommand).toBe(unsafeCommand);
      expect(session.revalidateAtEffectBoundary.plant.pumpCommand).toBe(safeCommand);
    },
  );

  it('derives I3 from the effect-time revision, not the revision current during replay', () => {
    const session = runIncident(createIncidentExperiment({ revisionTiming: 'after-valid-effect' }));
    const effect = session.approvalOnly.effects[0];
    expect(effect).toMatchObject({ authorityRevision: 'R17', currentRevisionAtCommit: 'R17' });
    expect(session.approvalOnly.currentRevision).toBe('R18');
    expect(session.approvalOnly.violation).toBeNull();
  });

  it('isolates forked state and makes the deliberate guard mutation discoverable by AEL', () => {
    const session = runIncident();
    const original = JSON.stringify(session.approvalOnly);
    approveRevisedProposal(session);
    expect(JSON.stringify(session.approvalOnly)).toBe(original);
    const mutated = runIncident(undefined, { disableFinalRevalidation: true });
    expect(mutated.revalidateAtEffectBoundary.violation?.invariant).toBe('I3_STALE_AUTHORITY_CANNOT_COMMIT');
  });

  it('exports, imports, replays, and rejects semantic tampering while excluding presentation data', () => {
    const session = approveRevisedProposal(runIncident());
    const capsule = exportIncidentCapsule(session, { camera: { alpha: 1, beta: 2, radius: 3 } });
    const withOtherCamera = exportIncidentCapsule(session, { camera: { alpha: 9, beta: 8, radius: 7 } });
    expect(capsule.semanticDigest).toBe(withOtherCamera.semanticDigest);
    expect(importIncidentCapsule(capsule)).toEqual(session);
    expect(replayIncidentCapsule(capsule)).toMatchObject({
      semanticDigest: incidentSemanticDigest(session),
      approvalOnly: 'I3_STALE_AUTHORITY_CANNOT_COMMIT',
      revalidateAtEffectBoundary: 'PASS',
    });
    const tampered = JSON.parse(JSON.stringify(capsule)) as { experiment: { proposedCommand: number } };
    tampered.experiment.proposedCommand = 0.71;
    expect(() => importIncidentCapsule(tampered)).toThrow('PLANT_INCIDENT_CAPSULE_DIGEST_MISMATCH');
  });
});
