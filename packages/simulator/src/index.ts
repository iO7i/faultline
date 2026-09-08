import { digest, type LogicalOperationId } from '../../contracts/src/index.js';
import type { IndustrialOperation } from '../../proposal/src/index.js';
export type SimulatorSnapshot = { setpoint: number; processFlow: number; effects: readonly string[] };
export type DispatchResult = { acknowledged: boolean; duplicate: boolean };
export type CounterfactualResult = {
  status: 'MODEL_ACCEPTS_WITHIN_DOMAIN' | 'MODEL_REJECTS' | 'MODEL_INCONCLUSIVE';
  adapterId: string;
  adapterVersion: string;
  initialState: SimulatorSnapshot;
  initialStateDigest: string;
  operationDigest: string;
  basis: string;
};
export interface SimulatorAdapter {
  readonly adapterId: string;
  readonly adapterVersion: string;
  snapshot(): SimulatorSnapshot;
  simulate(state: SimulatorSnapshot, operation: IndustrialOperation): CounterfactualResult;
  execute(operation: IndustrialOperation, id: LogicalOperationId): DispatchResult;
  readback(): SimulatorSnapshot;
  hasEffect(id: LogicalOperationId): boolean;
  effectCount(id: LogicalOperationId): number;
}
export class DeterministicCstrSimulator implements SimulatorAdapter {
  readonly adapterId = 'synthetic-cstr';
  readonly adapterVersion = '1.0.0';
  #state: SimulatorSnapshot = { setpoint: 120, processFlow: 120, effects: [] };
  #loseAck = false;
  injectAcknowledgementLoss() {
    this.#loseAck = true;
  }
  snapshot() {
    return structuredClone(this.#state);
  }
  simulate(state: SimulatorSnapshot, operation: IndustrialOperation): CounterfactualResult {
    const basis =
      operation.target !== 'FIC-101'
        ? 'TARGET_OUTSIDE_SYNTHETIC_MODEL'
        : operation.value.unit !== 'kg/s'
          ? 'UNIT_OUTSIDE_SYNTHETIC_MODEL'
          : operation.value.value < 0
            ? 'NEGATIVE_FLOW_REJECTED'
            : operation.value.value > 130
              ? 'FLOW_EXCEEDS_SYNTHETIC_BOUND'
              : 'WITHIN_SYNTHETIC_BOUND';
    return {
      status:
        basis === 'WITHIN_SYNTHETIC_BOUND'
          ? 'MODEL_ACCEPTS_WITHIN_DOMAIN'
          : basis.endsWith('OUTSIDE_SYNTHETIC_MODEL')
            ? 'MODEL_INCONCLUSIVE'
            : 'MODEL_REJECTS',
      adapterId: this.adapterId,
      adapterVersion: this.adapterVersion,
      initialState: structuredClone(state),
      initialStateDigest: digest(state),
      operationDigest: digest(operation),
      basis,
    };
  }
  execute(operation: IndustrialOperation, id: LogicalOperationId): DispatchResult {
    if (this.#state.effects.includes(id)) return { acknowledged: true, duplicate: true };
    this.#state = {
      setpoint: operation.value.value,
      processFlow: operation.value.value - 2.3,
      effects: [...this.#state.effects, id],
    };
    const lost = this.#loseAck;
    this.#loseAck = false;
    return { acknowledged: !lost, duplicate: false };
  }
  readback() {
    return this.snapshot();
  }
  hasEffect(id: LogicalOperationId) {
    return this.#state.effects.includes(id);
  }
  effectCount(id: LogicalOperationId) {
    return this.#state.effects.filter((x) => x === id).length;
  }
}
