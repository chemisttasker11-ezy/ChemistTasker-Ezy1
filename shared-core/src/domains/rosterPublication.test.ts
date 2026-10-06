import { describe, expect, it, vi } from 'vitest';
import { prepareRosterPublication } from './rosterPublication';

const ID1 = '55555555-1111-4444-8888-111111111111';
const ID2 = '55555555-1111-4444-8888-222222222222';

describe('reviewed roster publication attempts', () => {
  it('reuses one operation ID for retries of the same normalized command', () => {
    const allocate = vi.fn().mockReturnValueOnce(ID1).mockReturnValueOnce(ID2);
    const first = prepareRosterPublication(7, 3, ['b', 'a'], allocate);
    const retry = prepareRosterPublication(7, 3, ['a', 'b', 'a'], allocate, first);
    expect(retry).toBe(first);
    expect(allocate).toHaveBeenCalledTimes(1);
    expect(first.command).toEqual({ period_id: 7, expected_revision: 3, acknowledged_warning_keys: ['a', 'b'], operation_id: ID1 });
  });

  it('requires a new operation when the reviewed revision or warnings change', () => {
    const allocate = vi.fn().mockReturnValueOnce(ID1).mockReturnValueOnce(ID2);
    const first = prepareRosterPublication(7, 3, [], allocate);
    const changed = prepareRosterPublication(7, 4, [], allocate, first);
    expect(changed.command.operation_id).toBe(ID2);
    expect(changed.signature).not.toBe(first.signature);
  });

  it('does not invent a latest revision or accept invalid inputs', () => {
    expect(() => prepareRosterPublication(7, 0, [], () => ID1)).toThrow('review');
    expect(() => prepareRosterPublication(7, 1.5, [], () => ID1)).toThrow('review');
    expect(() => prepareRosterPublication(7, 3, [''], () => ID1)).toThrow('warning');
    expect(() => prepareRosterPublication(7, 3, [], () => 'bad-id')).toThrow('UUID');
  });
});
