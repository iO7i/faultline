import type { AelViolation, ExecutionEvent } from '../../../packages/counterexample/src/index.js';
import { EQUIPMENT_IDS, FAULTLINE_EQUIPMENT_SCOPE, type EquipmentId } from './plant/equipment.js';
import type { PlantState } from './plant/model.js';

export type EquipmentSeverity = 'normal' | 'selected' | 'pending' | 'violation' | 'offline';

export type ScenePresentationState = Readonly<{
  equipment: Readonly<Record<EquipmentId, EquipmentSeverity>>;
  pumpAnimation: number;
  flowSpeed: Readonly<Record<'intake' | 'feed' | 'permeate' | 'brine', number>>;
  authority: Readonly<{ approvedRevision: 'R17'; currentRevision: 'R17' | 'R18' }>;
}>;

const latestEvent = (events: readonly ExecutionEvent[], type: ExecutionEvent['type']) =>
  [...events].reverse().find((event) => event.type === type);

export const presentationFrom = (
  plant: PlantState,
  events: readonly ExecutionEvent[],
  violation: AelViolation | null,
  selected: EquipmentId | null,
): ScenePresentationState => {
  const pendingPump =
    Boolean(latestEvent(events, 'DispatchStarted')) && !latestEvent(events, 'EffectCommitted');
  const violationScope = violation ? (FAULTLINE_EQUIPMENT_SCOPE[violation.invariant] ?? []) : [];
  const equipment = Object.fromEntries(
    EQUIPMENT_IDS.map((id) => {
      const severity: EquipmentSeverity = !plant.availability[id]
        ? 'offline'
        : violationScope.includes(id)
          ? 'violation'
          : selected === id
            ? 'selected'
            : id === 'P-101' && pendingPump
              ? 'pending'
              : 'normal';
      return [id, severity];
    }),
  ) as Record<EquipmentId, EquipmentSeverity>;
  return {
    equipment,
    pumpAnimation: plant.pumpLoad,
    flowSpeed: {
      intake: plant.intakeFlow,
      feed: plant.roFeedFlow,
      permeate: plant.permeateFlow,
      brine: plant.brineFlow,
    },
    authority: {
      approvedRevision: 'R17',
      currentRevision: plant.sourceRevision,
    },
  };
};
