import { describe, expect, it } from 'vitest';
import { createInitialPlantState, stepPlant } from './plant/model.js';
import { presentationFrom } from './presentation.js';

const plant = stepPlant(createInitialPlantState(), {
  sourceRevision: 'R18',
  requestedFeed: 0.82,
  pumpCommand: 0.86,
});

describe('Plant Lab presentation mapping', () => {
  it('marks P-101 as the visual scope of the real I3 result', () => {
    const presentation = presentationFrom(
      plant,
      [],
      {
        invariant: 'I3_STALE_AUTHORITY_CANNOT_COMMIT',
        code: 'STALE_AUTHORITY_EFFECT',
        message: 'stale',
        effectId: 'effect-1',
      },
      'P-101',
    );
    expect(presentation.equipment['P-101']).toBe('violation');
    expect(presentation.authority.currentRevision).toBe('R18');
  });

  it('uses pending state only while dispatch lacks an effect', () => {
    const presentation = presentationFrom(
      plant,
      [
        {
          eventId: 'event-3',
          logicalTime: 3,
          type: 'DispatchStarted',
          operationId: 'operation',
          principal: 'principal',
          tenant: 'tenant',
          action: 'REFUND',
          argumentsHash: 'hash',
          authorityId: 'authority-r17',
          authorityRevision: 17,
          effectId: null,
          workerId: 'worker-A',
          detail: 'dispatch',
        },
      ],
      null,
      'RO-101',
    );
    expect(presentation.equipment['P-101']).toBe('pending');
    expect(presentation.equipment['RO-101']).toBe('selected');
  });
});
