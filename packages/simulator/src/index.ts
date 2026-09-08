import type { LogicalOperationId } from '../../contracts/src/index.js';
import type { IndustrialOperation } from '../../proposal/src/index.js';
export type SimulatorSnapshot = { setpoint: number; processFlow: number; effects: readonly string[] };
export type DispatchResult = { acknowledged: boolean; duplicate: boolean };
export type CounterfactualResult = {
  status: 'MODEL_ACCEPTS_WITHIN_DOMAIN' | 'MODEL_REJECTS' | 'MODEL_INCONCLUSIVE';
  initialState: SimulatorSnapshot;
};
export class DeterministicCstrSimulator {
  #state: SimulatorSnapshot = { setpoint: 120, processFlow: 120, effects: [] };
  #loseAck = false;
  injectAcknowledgementLoss() {
    this.#loseAck = true;
  }
  snapshot() {
    return structuredClone(this.#state);
  }
  simulate(state: SimulatorSnapshot, operation: IndustrialOperation): CounterfactualResult {
    return operation.value.unit === 'kg/s' && operation.value.value <= 130
      ? { status: 'MODEL_ACCEPTS_WITHIN_DOMAIN', initialState: state }
      : { status: 'MODEL_REJECTS', initialState: state };
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
