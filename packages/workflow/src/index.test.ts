import { describe, expect, it } from 'vitest';
import { transition } from './index.js';
import { ids } from '../../contracts/src/index.js';

describe('workflow', () => {
  it('records only explicit legal transitions', () => {
    const proposed = { id: ids.operation('op'), status: 'PROPOSED' as const, trace: ['PROPOSED'] as const };
    expect(transition(proposed, 'ADMISSIBLE').trace).toEqual(['PROPOSED', 'ADMISSIBLE']);
    expect(() => transition(proposed, 'AUTHORIZED')).toThrow('INVALID_WORKFLOW_TRANSITION');
  });
});
