import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileSyntheticCstrFixture, runDemos } from '../../apps/cli/src/demo.js';
import { parseSyntheticCstrEngineeringFixture } from '../../packages/plant-ir/src/index.js';

describe('compiled contract artifact', () => {
  it('retains source, node, and runtime-monitor evidence needed for inspection', () => {
    const { r17 } = runDemos();
    expect(r17.contract.sourceRevisions).toHaveLength(1);
    expect(r17.contract.nodeDigests['FIC-101']).toMatch(/^[a-f0-9]{64}$/);
    expect(r17.contract.runtimeMonitors).toEqual([
      { kind: 'ARGUMENT_BOUND', constraintId: 'CoolingAvailable' },
    ]);
  });
  it('compiles the checked-in synthetic R17 and R18 fixture declarations rather than inferred labels', () => {
    const load = (generation: 'R17' | 'R18') => {
      const raw: unknown = JSON.parse(
        readFileSync(resolve(`fixtures/cstr/engineering/${generation}.json`), 'utf8'),
      );
      const parsed = parseSyntheticCstrEngineeringFixture(raw);
      if (!parsed.ok) throw new Error(parsed.error);
      return compileSyntheticCstrFixture(parsed.fixture).contract;
    };
    const r17 = load('R17');
    const r18 = load('R18');
    expect(r17.digest).not.toBe(r18.digest);
    expect(r17.constraints[0]?.max).toEqual({ value: 124, unit: 'kg/s' });
    expect(r18.constraints[0]?.max).toEqual({ value: 110, unit: 'kg/s' });
  });
});
