import type { EquipmentId } from './equipment.js';

export type Availability = Readonly<Record<EquipmentId, boolean>>;

export type PlantState = Readonly<{
  tick: number;
  sourceRevision: 'R17' | 'R18';
  intakeFlow: number;
  pretreatmentFlow: number;
  pumpOutput: number;
  roFeedFlow: number;
  permeateFlow: number;
  brineFlow: number;
  pumpLoad: number;
  tank101Level: number;
  tank201Level: number;
  availability: Availability;
}>;

export type PlantInput = Readonly<{
  sourceRevision?: 'R17' | 'R18';
  requestedFeed?: number;
  pumpCommand?: number;
  availability?: Partial<Availability>;
}>;

export const DEFAULT_AVAILABILITY: Availability = {
  'IN-101': true,
  'TK-101': true,
  'PT-101': true,
  'P-101': true,
  'RO-101': true,
  'TK-201': true,
  'BR-101': true,
  'CB-01': true,
};

const clamp = (value: number, lower = 0, upper = 1): number => Math.min(upper, Math.max(lower, value));
const finite = (value: number): number => (Number.isFinite(value) ? value : 0);
const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000;

export const createInitialPlantState = (): PlantState => ({
  tick: 0,
  sourceRevision: 'R17',
  intakeFlow: 0,
  pretreatmentFlow: 0,
  pumpOutput: 0,
  roFeedFlow: 0,
  permeateFlow: 0,
  brineFlow: 0,
  pumpLoad: 0,
  tank101Level: 0.55,
  tank201Level: 0.35,
  availability: { ...DEFAULT_AVAILABILITY },
});

/**
 * A deliberately small normalized process model. Its conservation relationship is
 * permeate + brine = RO feed; it is not an engineering or process-safety model.
 */
export const stepPlant = (previous: PlantState, input: PlantInput = {}): PlantState => {
  const availability: Availability = { ...previous.availability, ...input.availability };
  const requestedFeed = clamp(finite(input.requestedFeed ?? 0.82));
  const pumpCommand = clamp(finite(input.pumpCommand ?? 0.86));
  const intakeFlow = availability['IN-101'] && availability['TK-101'] ? requestedFeed : 0;
  const pretreatmentFlow = availability['PT-101'] ? intakeFlow * 0.97 : 0;
  const pumpOutput = availability['P-101'] ? pretreatmentFlow * pumpCommand : 0;
  const roFeedFlow = availability['RO-101'] ? pumpOutput : 0;
  const permeateFlow = round(roFeedFlow * 0.45);
  const brineFlow = round(roFeedFlow - permeateFlow);
  const tank101Level = clamp(previous.tank101Level + (intakeFlow - pretreatmentFlow) * 0.025);
  const tank201Level = clamp(previous.tank201Level + (permeateFlow - 0.18) * 0.025);
  return {
    tick: previous.tick + 1,
    sourceRevision: input.sourceRevision ?? previous.sourceRevision,
    intakeFlow: round(intakeFlow),
    pretreatmentFlow: round(pretreatmentFlow),
    pumpOutput: round(pumpOutput),
    roFeedFlow: round(roFeedFlow),
    permeateFlow,
    brineFlow,
    pumpLoad: round(availability['P-101'] ? pumpCommand * (pretreatmentFlow > 0 ? 1 : 0) : 0),
    tank101Level: round(tank101Level),
    tank201Level: round(tank201Level),
    availability,
  };
};

export const arePlantValuesValid = (state: PlantState): boolean => {
  const values = [
    state.intakeFlow,
    state.pretreatmentFlow,
    state.pumpOutput,
    state.roFeedFlow,
    state.permeateFlow,
    state.brineFlow,
    state.pumpLoad,
    state.tank101Level,
    state.tank201Level,
  ];
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
};
