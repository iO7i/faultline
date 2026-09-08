import type { LogicalOperationId } from '../../contracts/src/index.js';

export type WorkflowStatus =
  | 'PROPOSED'
  | 'ADMISSIBLE'
  | 'AUTHORIZED'
  | 'REVALIDATING'
  | 'READY_TO_DISPATCH'
  | 'DISPATCHING'
  | 'COMPLETION_UNKNOWN'
  | 'RECONCILING'
  | 'COMPLETED'
  | 'REJECTED'
  | 'FAILED';
export type WorkflowState = {
  id: LogicalOperationId;
  status: WorkflowStatus;
  trace: readonly WorkflowStatus[];
};
export interface DurableWorkflowStore {
  load(id: LogicalOperationId): WorkflowState | null;
  save(state: WorkflowState): void;
}
const allowedTransitions: Readonly<Record<WorkflowStatus, readonly WorkflowStatus[]>> = {
  PROPOSED: ['ADMISSIBLE', 'REJECTED'],
  ADMISSIBLE: ['AUTHORIZED', 'REJECTED'],
  AUTHORIZED: ['REVALIDATING', 'REJECTED'],
  REVALIDATING: ['READY_TO_DISPATCH', 'REJECTED'],
  READY_TO_DISPATCH: ['DISPATCHING', 'REJECTED'],
  DISPATCHING: ['COMPLETION_UNKNOWN', 'COMPLETED', 'FAILED'],
  COMPLETION_UNKNOWN: ['RECONCILING'],
  RECONCILING: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  REJECTED: [],
  FAILED: [],
};
export const transition = (state: WorkflowState, status: WorkflowStatus): WorkflowState => {
  if (!allowedTransitions[state.status].includes(status))
    throw new Error(`INVALID_WORKFLOW_TRANSITION:${state.status}->${status}`);
  return { ...state, status, trace: [...state.trace, status] };
};
export class InMemoryDurableWorkflowStore implements DurableWorkflowStore {
  #states = new Map<LogicalOperationId, WorkflowState>();
  load(id: LogicalOperationId) {
    const state = this.#states.get(id);
    return state ? structuredClone(state) : null;
  }
  save(state: WorkflowState) {
    this.#states.set(state.id, structuredClone(state));
  }
}
