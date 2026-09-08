import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createFaultlineTrace, initialTraceEvents, stepFaultlineTrace } from './bridge.js';
import { sha256Hex } from './browser-crypto.js';

const run = (kind: 'safe' | 'stale' | 'replay') => {
  let trace = createFaultlineTrace(kind);
  let result = stepFaultlineTrace(trace);
  while (!result.complete) {
    trace = result.trace;
    result = stepFaultlineTrace(trace);
  }
  return result;
};

describe('Plant Lab Faultline bridge', () => {
  it('executes the existing safe AEL trace to PASS', () => {
    const trace = createFaultlineTrace('safe');
    expect(initialTraceEvents(trace).map((event) => event.type)).toEqual([
      'ProposalCreated',
      'AuthorityGranted',
    ]);
    expect(run('safe').violation).toBeNull();
  });

  it('executes the stale path through the existing AEL checker', () => {
    const result = run('stale');
    expect(result.violation?.invariant).toBe('I3_STALE_AUTHORITY_CANNOT_COMMIT');
    expect(result.trace.state.events.map((event) => event.type)).toContain('AuthoritySuperseded');
  });

  it('replays the checked-in minimized witness with the same I3 result', () => {
    const result = run('replay');
    expect(result.trace.replayWitness?.counterexampleId).toBe('FL-0001');
    expect(result.trace.state.events).toHaveLength(5);
    expect(result.violation?.invariant).toBe('I3_STALE_AUTHORITY_CANNOT_COMMIT');
  });

  it('matches Node SHA-256 for the browser-only compatibility adapter', () => {
    const value = 'Faultline Plant Lab / R17 → R18';
    expect(sha256Hex(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });
});
