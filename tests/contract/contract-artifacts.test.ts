import { describe, expect, it } from 'vitest';
import { runDemos } from '../../apps/cli/src/demo.js';

describe('compiled contract artifact', () => {
  it('retains source, node, and runtime-monitor evidence needed for inspection', () => {
    const { r17 } = runDemos();
    expect(r17.contract.sourceRevisions).toHaveLength(1);
    expect(r17.contract.nodeDigests['FIC-101']).toMatch(/^[a-f0-9]{64}$/);
    expect(r17.contract.runtimeMonitors).toEqual([
      { kind: 'ARGUMENT_BOUND', constraintId: 'CoolingAvailable' },
    ]);
  });
});
