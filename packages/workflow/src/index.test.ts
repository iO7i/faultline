import { describe, expect, it } from 'vitest';
import { InMemoryDurableWorkflowStore, transition } from './index.js';
import { ids } from '../../contracts/src/index.js';

describe('workflow', () => {
  it('records only explicit legal transitions', () => {
    const proposed = { id: ids.operation('op'), status: 'PROPOSED' as const, trace: ['PROPOSED'] as const };
    expect(transition(proposed, 'ADMISSIBLE').trace).toEqual(['PROPOSED', 'ADMISSIBLE']);
    expect(() => transition(proposed, 'AUTHORIZED')).toThrow('INVALID_WORKFLOW_TRANSITION');
  });
  it('persists an isolated workflow snapshot for a later resume', () => {
    const store = new InMemoryDurableWorkflowStore();
    const initial = {
      id: ids.operation('resume-op'),
      status: 'PROPOSED' as const,
      trace: ['PROPOSED'] as const,
    };
    store.save(initial);
    const loaded = store.load(initial.id);
    if (!loaded) throw new Error('workflow unexpectedly absent');
    store.save(transition(loaded, 'ADMISSIBLE'));
    expect(store.load(initial.id)).toEqual({
      id: initial.id,
      status: 'ADMISSIBLE',
      trace: ['PROPOSED', 'ADMISSIBLE'],
    });
    expect(initial.status).toBe('PROPOSED');
  });
});
