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
  digest: string;
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
