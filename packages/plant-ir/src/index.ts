import {
  digest,
  type AssetId,
  type EngineeringGenerationId,
  type EngineeringRevisionId,
  type EngineeringSourceId,
  type InstrumentId,
  type PlantId,
  type UnitId,
} from '../../contracts/src/index.js';
export type EngineeringSource = {
  sourceId: EngineeringSourceId;
  revision: EngineeringRevisionId;
  kind:
    | 'MANUAL_ASSERTION'
    | 'EQUIPMENT_DATA'
    | 'OPERATING_ENVELOPE'
    | 'OPERATING_MODE'
    | 'PROCEDURE_RULE'
    | 'SAFEGUARD_RULE'
    | 'PROCESS_MODEL'
    | 'DEXPI';
  scope: string;
  approval: { status: 'APPROVED' | 'DRAFT'; approvedBy?: string; approvedAt?: string };
  declaration?: Readonly<Record<string, unknown>>;
  digest: string;
};
export type SyntheticCstrEngineeringFixture = {
  generation: string;
  coolingAvailableCapacityPercent: number;
  feedAdjustMaxKgPerS: number;
  synthetic: true;
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);
export const parseSyntheticCstrEngineeringFixture = (
  value: unknown,
): { ok: true; fixture: SyntheticCstrEngineeringFixture } | { ok: false; error: string } => {
  if (!isRecord(value)) return { ok: false, error: 'FIXTURE_MUST_BE_AN_OBJECT' };
  const { generation, coolingAvailableCapacityPercent, feedAdjustMaxKgPerS, synthetic } = value;
  if (typeof generation !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(generation))
    return { ok: false, error: 'INVALID_GENERATION' };
  if (
    typeof coolingAvailableCapacityPercent !== 'number' ||
    !Number.isFinite(coolingAvailableCapacityPercent) ||
    coolingAvailableCapacityPercent < 0 ||
    coolingAvailableCapacityPercent > 100
  )
    return { ok: false, error: 'INVALID_COOLING_CAPACITY_PERCENT' };
  if (
    typeof feedAdjustMaxKgPerS !== 'number' ||
    !Number.isFinite(feedAdjustMaxKgPerS) ||
    feedAdjustMaxKgPerS < 0
  )
    return { ok: false, error: 'INVALID_FEED_ADJUST_BOUND' };
  if (synthetic !== true) return { ok: false, error: 'SYNTHETIC_MARKER_REQUIRED' };
  return {
    ok: true,
    fixture: { generation, coolingAvailableCapacityPercent, feedAdjustMaxKgPerS, synthetic: true },
  };
};
export type Dimension =
  'Pressure' | 'Temperature' | 'MassFlow' | 'Percent' | 'Dimensionless' | 'Boolean' | 'DiscreteState';
export type Unit = 'bar' | 'kPa' | 'degC' | 'kg/s' | '%' | 'unitless';
export type Quantity = { value: number; unit: Unit };
const unitDimensions: Readonly<Record<Unit, Dimension>> = {
  bar: 'Pressure',
  kPa: 'Pressure',
  degC: 'Temperature',
  'kg/s': 'MassFlow',
  '%': 'Percent',
  unitless: 'Dimensionless',
};
export const dimensionForUnit = (unit: Unit): Dimension => unitDimensions[unit];
export const unitMatchesDimension = (unit: Unit, dimension: Dimension | undefined) =>
  dimension === undefined || dimensionForUnit(unit) === dimension;
export type PlantNode = {
  assetId: AssetId;
  type:
    | 'PLANT'
    | 'AREA'
    | 'UNIT'
    | 'EQUIPMENT'
    | 'INSTRUMENT'
    | 'CONTROL_TARGET'
    | 'SAFEGUARD'
    | 'OPERATING_MODE';
  scope: string;
  sourceIds: readonly EngineeringSourceId[];
  generation: EngineeringGenerationId;
  actuatable?: boolean;
  dimension?: Dimension;
};
export type TopologyEdge = {
  from: AssetId;
  to: AssetId;
  kind:
    | 'MEMBERSHIP'
    | 'INSTRUMENT_OF'
    | 'CONTROL_TARGET'
    | 'COOLING_DEPENDENCY'
    | 'UPSTREAM'
    | 'REQUIRED'
    | 'ABSENCE';
};
export type PlantIR = {
  plantId: PlantId;
  unitId: UnitId;
  generation: EngineeringGenerationId;
  nodes: readonly PlantNode[];
  edges: readonly TopologyEdge[];
};
export type EngineeringSourceBundle = { ir: PlantIR; sources: readonly EngineeringSource[] };
export interface EngineeringSourceAdapter {
  load(): Promise<EngineeringSourceBundle>;
}
export class JsonEngineeringFixtureAdapter implements EngineeringSourceAdapter {
  constructor(private readonly bundle: EngineeringSourceBundle) {}
  async load() {
    return structuredClone(this.bundle);
  }
}
export const plantIrDigest = (ir: PlantIR) =>
  digest({
    ...ir,
    nodes: [...ir.nodes].sort((left, right) => left.assetId.localeCompare(right.assetId)),
    edges: [...ir.edges].sort((left, right) =>
      `${left.from}:${left.to}:${left.kind}`.localeCompare(`${right.from}:${right.to}:${right.kind}`),
    ),
  });
export const findNode = (ir: PlantIR, id: AssetId) => ir.nodes.find((node) => node.assetId === id);
export const validateSource = (source: EngineeringSource) =>
  source.approval.status === 'APPROVED'
    ? []
    : [
        {
          code: 'UNAPPROVED_ENGINEERING_SOURCE' as const,
          severity: 'ERROR' as const,
          message: `Mandatory source ${source.sourceId} is draft`,
          sourceRefs: [source.sourceId],
        },
      ];
export const makeSource = (input: Omit<EngineeringSource, 'digest'>): EngineeringSource => ({
  ...input,
  digest: digest(input),
});
export type CstrRefs = {
  plantId: PlantId;
  unitId: UnitId;
  reactor: AssetId;
  feedController: InstrumentId;
  temperature: InstrumentId;
  cooling: AssetId;
};
