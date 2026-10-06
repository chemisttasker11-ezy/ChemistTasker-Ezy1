import { describe, expect, it, vi } from 'vitest';
import { createAsyncScope, StaleAsyncScopeError } from './asyncScope';
import { reviewRosterSelection, type RosterValidationResult } from '../domains/rosterPublication';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const period = { period_id: 7, draft_revision: 3 };
const validation: RosterValidationResult = { is_valid: true, draft_revision: 3, errors: [], warnings: [] };

describe('selection-owned async requests', () => {
  it('rejects late initialization before applying its period or sending validation', async () => {
    const scope = createAsyncScope();
    const initialized = deferred<typeof period>();
    const onPeriod = vi.fn();
    const validate = vi.fn().mockResolvedValue(validation);
    const pending = reviewRosterSelection({
      ticket: scope.begin('review'), period: null,
      initialize: () => initialized.promise, validate, onPeriod,
    });
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleAsyncScopeError);
    scope.dispose(); // Pharmacy/week component has unmounted.
    initialized.resolve(period);
    await rejected;
    expect(onPeriod).not.toHaveBeenCalled();
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejects a validation response after selection changes', async () => {
    const scope = createAsyncScope();
    const response = deferred<RosterValidationResult>();
    const pending = reviewRosterSelection({
      ticket: scope.begin('review'), period,
      initialize: vi.fn(), validate: () => response.promise, onPeriod: vi.fn(),
    });
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleAsyncScopeError);
    scope.dispose();
    response.resolve(validation);
    await rejected;
  });

  it('does not revive a ticket after leaving and returning to the same selection', async () => {
    const scope = createAsyncScope();
    const old = scope.begin('review');
    scope.dispose();
    scope.activate(); // Also models React strict-effect reactivation.
    const current = scope.begin('review');
    expect(old.isCurrent()).toBe(false);
    expect(current.isCurrent()).toBe(true);
  });

  it('does not let an older load or finally affect a more recent operation', async () => {
    const scope = createAsyncScope();
    const response = deferred<string>();
    const old = scope.begin('action');
    const clearBusy = vi.fn();
    const pending = old.run(() => response.promise)
      .catch(() => undefined)
      .finally(() => { if (old.isCurrent()) clearBusy(); });
    const current = scope.begin('action');
    response.resolve('old');
    await pending;
    expect(clearBusy).not.toHaveBeenCalled();
    expect(current.isCurrent()).toBe(true);
  });

  it('does not begin a dependent request with an already stale ticket', async () => {
    const scope = createAsyncScope();
    const ticket = scope.begin('review');
    const send = vi.fn();
    scope.cancel('review');
    await expect(ticket.run(send)).rejects.toBeInstanceOf(StaleAsyncScopeError);
    expect(send).not.toHaveBeenCalled();
  });

  it('suppresses stale failures but preserves failures for the current selection', async () => {
    const scope = createAsyncScope();
    const response = deferred<string>();
    const current = scope.begin('review');
    const pending = current.run(() => response.promise);
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleAsyncScopeError);
    scope.dispose();
    response.reject(new Error('old server failure'));
    await rejected;
    scope.activate();
    await expect(scope.begin('review').run(async () => { throw new Error('current failure'); }))
      .rejects.toThrow('current failure');
  });

  it('does not run publication completion callbacks for an unmounted selection', async () => {
    const scope = createAsyncScope();
    const accepted = deferred<string>();
    const ticket = scope.begin('publish');
    const callback = vi.fn();
    const pending = ticket.run(() => accepted.promise).then(() => ticket.run(callback));
    const rejected = expect(pending).rejects.toBeInstanceOf(StaleAsyncScopeError);
    scope.dispose();
    accepted.resolve('PUBLISHED'); // This does not roll back an accepted server command.
    await rejected;
    expect(callback).not.toHaveBeenCalled();
  });

  it('allows independent selection instances to complete without sharing busy state', async () => {
    const oldScope = createAsyncScope();
    const oldTicket = oldScope.begin('action');
    oldScope.dispose();
    const nextScope = createAsyncScope();
    const nextTicket = nextScope.begin('action');
    await expect(nextTicket.run(async () => 'next')).resolves.toBe('next');
    expect(oldTicket.isCurrent()).toBe(false);
  });

  it('initializes and validates exactly the selected persisted revision', async () => {
    const onPeriod = vi.fn();
    const initialize = vi.fn().mockResolvedValue(period);
    const validate = vi.fn().mockResolvedValue(validation);
    const result = await reviewRosterSelection({
      ticket: createAsyncScope().begin('review'), period: null,
      initialize, validate, onPeriod,
    });
    expect(initialize).toHaveBeenCalledOnce();
    expect(validate).toHaveBeenCalledExactlyOnceWith({ period_id: 7, expected_revision: 3 });
    expect(onPeriod).toHaveBeenCalledExactlyOnceWith(period);
    expect(result).toEqual({ period, validation });
  });

  it('does not initialize an existing period or validate invalid persisted metadata', async () => {
    const initialize = vi.fn();
    const validate = vi.fn().mockResolvedValue(validation);
    await reviewRosterSelection({
      ticket: createAsyncScope().begin('review'), period,
      initialize, validate, onPeriod: vi.fn(),
    });
    expect(initialize).not.toHaveBeenCalled();
    validate.mockClear();
    await expect(reviewRosterSelection({
      ticket: createAsyncScope().begin('review'), period: { period_id: 7, draft_revision: 0 },
      initialize, validate, onPeriod: vi.fn(),
    })).rejects.toThrow('persisted roster');
    expect(validate).not.toHaveBeenCalled();
  });
});
