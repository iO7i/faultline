import { describe, expect, it } from 'vitest';
import {
  EQUIPMENT,
  EQUIPMENT_IDS,
  FAULTLINE_EQUIPMENT_SCOPE,
  PROCESS_CONNECTIONS,
  isEquipmentId,
} from './equipment.js';
import { RENDERED_EQUIPMENT_IDS } from '../scene.js';

describe('Plant Lab semantic registry', () => {
  it('contains every required stable identifier exactly once', () => {
    expect(new Set(EQUIPMENT_IDS).size).toBe(EQUIPMENT_IDS.length);
    expect(EQUIPMENT.map((equipment) => equipment.id)).toEqual(EQUIPMENT_IDS);
  });

  it('connects only declared equipment and binds AEL scope to declared equipment', () => {
    for (const connection of PROCESS_CONNECTIONS) {
      expect(isEquipmentId(connection.from)).toBe(true);
      expect(isEquipmentId(connection.to)).toBe(true);
    }
    for (const scope of Object.values(FAULTLINE_EQUIPMENT_SCOPE))
      for (const id of scope) expect(isEquipmentId(id)).toBe(true);
  });

  it('renders every critical semantic object with its stable ID', () => {
    const critical = EQUIPMENT.filter((equipment) => equipment.critical).map((equipment) => equipment.id);
    expect(RENDERED_EQUIPMENT_IDS).toEqual(EQUIPMENT_IDS);
    expect(critical.every((id) => RENDERED_EQUIPMENT_IDS.includes(id))).toBe(true);
  });
});
