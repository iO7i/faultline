import { describe, expect, it } from 'vitest';
import { arePlantValuesValid, createInitialPlantState, stepPlant } from './model.js';

describe('Plant Lab normalized process model', () => {
  it('is deterministic and resettable', () => {
    const input = { requestedFeed: 0.82, pumpCommand: 0.86, sourceRevision: 'R17' as const };
    expect(stepPlant(createInitialPlantState(), input)).toEqual(stepPlant(createInitialPlantState(), input));
    expect(createInitialPlantState()).toEqual(createInitialPlantState());
  });

  it('keeps repeated normalized process values finite and bounded', () => {
    let state = createInitialPlantState();
    for (let tick = 0; tick < 100; tick += 1) {
      state = stepPlant(state, { requestedFeed: tick % 2 ? 0.82 : 0.72, pumpCommand: 0.86 });
      expect(arePlantValuesValid(state)).toBe(true);
      expect(state.permeateFlow + state.brineFlow).toBeCloseTo(state.roFeedFlow, 6);
    }
  });

  it('stays safe for non-finite input and unavailable equipment', () => {
    const offlinePump = stepPlant(createInitialPlantState(), {
      requestedFeed: Number.NaN,
      pumpCommand: Number.POSITIVE_INFINITY,
      availability: { 'P-101': false },
    });
    expect(offlinePump.pumpOutput).toBe(0);
    expect(offlinePump.roFeedFlow).toBe(0);
    expect(offlinePump.permeateFlow).toBe(0);
    expect(arePlantValuesValid(offlinePump)).toBe(true);
    const offlineRo = stepPlant(createInitialPlantState(), { availability: { 'RO-101': false } });
    expect(offlineRo.permeateFlow).toBe(0);
  });
});
