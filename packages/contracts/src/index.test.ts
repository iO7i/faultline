import { describe, expect, it } from 'vitest';
import { digest, InMemoryEventLog } from './index.js';
describe('canonical digest and events', () => {
  it('ignores object key order and detects meaning', () => {
    expect(digest({ b: 2, a: 1 })).toBe(digest({ a: 1, b: 2 }));
    expect(digest({ a: 1 })).not.toBe(digest({ a: 2 }));
  });
  it('records structured, caller-owned domain events', () => {
    const events = new InMemoryEventLog();
    events.append({
      eventId: 'event-1',
      type: 'plant_contract.compiled',
      at: '2026-01-01T00:00:00.000Z',
      caseId: 'case-1',
      payload: { generation: 'R17' },
    });
    expect(events.list()).toHaveLength(1);
  });
});
