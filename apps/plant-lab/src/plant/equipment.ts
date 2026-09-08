export const EQUIPMENT_IDS = [
  'IN-101',
  'TK-101',
  'PT-101',
  'P-101',
  'RO-101',
  'TK-201',
  'BR-101',
  'CB-01',
] as const;

export type EquipmentId = (typeof EQUIPMENT_IDS)[number];

export type EquipmentKind =
  'intake' | 'tank' | 'pretreatment' | 'pump' | 'ro-rack' | 'brine' | 'control-building';

export type EquipmentSpec = Readonly<{
  id: EquipmentId;
  name: string;
  kind: EquipmentKind;
  summary: string;
  critical: boolean;
}>;

export const EQUIPMENT: readonly EquipmentSpec[] = [
  {
    id: 'IN-101',
    name: 'Seawater intake',
    kind: 'intake',
    summary: 'Synthetic intake boundary.',
    critical: true,
  },
  { id: 'TK-101', name: 'Raw-water tank', kind: 'tank', summary: 'Normalized feed buffer.', critical: true },
  {
    id: 'PT-101',
    name: 'Pretreatment skid',
    kind: 'pretreatment',
    summary: 'Simplified pretreatment stage.',
    critical: true,
  },
  {
    id: 'P-101',
    name: 'High-pressure pump',
    kind: 'pump',
    summary: 'Action-associated pump fixture.',
    critical: true,
  },
  {
    id: 'RO-101',
    name: 'RO rack',
    kind: 'ro-rack',
    summary: 'Six-vessel reverse-osmosis rack.',
    critical: true,
  },
  {
    id: 'TK-201',
    name: 'Permeate tank',
    kind: 'tank',
    summary: 'Normalized product-water buffer.',
    critical: true,
  },
  {
    id: 'BR-101',
    name: 'Brine outlet',
    kind: 'brine',
    summary: 'Synthetic concentrate discharge.',
    critical: false,
  },
  {
    id: 'CB-01',
    name: 'Control building',
    kind: 'control-building',
    summary: 'Local control-room context.',
    critical: false,
  },
] as const;

export const equipmentById = (id: EquipmentId): EquipmentSpec => {
  const equipment = EQUIPMENT.find((candidate) => candidate.id === id);
  if (!equipment) throw new Error(`UNKNOWN_EQUIPMENT:${id}`);
  return equipment;
};

export type ProcessConnection = Readonly<{
  id: string;
  from: EquipmentId;
  to: EquipmentId;
  stream: 'raw-water' | 'treated-water' | 'high-pressure-feed' | 'permeate' | 'brine';
}>;

export const PROCESS_CONNECTIONS: readonly ProcessConnection[] = [
  { id: 'raw-intake', from: 'IN-101', to: 'TK-101', stream: 'raw-water' },
  { id: 'tank-to-pretreatment', from: 'TK-101', to: 'PT-101', stream: 'raw-water' },
  { id: 'pretreatment-to-pump', from: 'PT-101', to: 'P-101', stream: 'treated-water' },
  { id: 'pump-to-ro', from: 'P-101', to: 'RO-101', stream: 'high-pressure-feed' },
  { id: 'ro-to-permeate', from: 'RO-101', to: 'TK-201', stream: 'permeate' },
  { id: 'ro-to-brine', from: 'RO-101', to: 'BR-101', stream: 'brine' },
] as const;

// The browser scene maps this existing public AEL fixture to a visible plant object.
export const FAULTLINE_EQUIPMENT_SCOPE: Readonly<Record<string, readonly EquipmentId[]>> = {
  I3_STALE_AUTHORITY_CANNOT_COMMIT: ['P-101'],
};

export const isEquipmentId = (value: string): value is EquipmentId =>
  (EQUIPMENT_IDS as readonly string[]).includes(value);
