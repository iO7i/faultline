import { describe, expect, it } from 'vitest';
import { operationDigest } from './index.js';
import { ids } from '../../contracts/src/index.js';
describe('proposal', () =>
  it('binds exact arguments', () =>
    expect(
      operationDigest({
        kind: 'SETPOINT_CHANGE',
        target: ids.asset('FIC-101'),
        value: { value: 124, unit: 'kg/s' },
      }),
    ).not.toBe(
      operationDigest({
        kind: 'SETPOINT_CHANGE',
        target: ids.asset('FIC-101'),
        value: { value: 125, unit: 'kg/s' },
      }),
    )));
