/** Revision-aware publication contracts shared by all roster clients. */
export interface RosterValidateCommand {
  period_id: number;
  expected_revision: number;
}

export interface RosterPublishCommand extends RosterValidateCommand {
  operation_id: string;
  acknowledged_warning_keys: string[];
}

export interface RosterValidationIssue {
  type?: string;
  message?: string;
  [key: string]: unknown;
}

export interface RosterValidationResult {
  is_valid: boolean;
  draft_revision: number;
  errors: RosterValidationIssue[];
  warnings: Array<RosterValidationIssue & { warning_key: string }>;
  total_assignments?: number;
  total_workers?: number;
}

export interface RosterPublicationResult {
  status: 'PUBLISHED';
  period_id: number;
  week_start: string;
  published_at: string | null;
  draft_revision: number;
  published_revision: number;
  validation: Omit<RosterValidationResult, 'draft_revision'>;
}

export interface RosterPublicationAttempt {
  signature: string;
  command: RosterPublishCommand;
}

/** Keep the same UUID when retrying the same reviewed command after a lost response. */
export function prepareRosterPublication(
  periodId: number,
  expectedRevision: number,
  acknowledgedWarningKeys: readonly string[],
  allocateId: () => string,
  previous?: RosterPublicationAttempt,
): RosterPublicationAttempt {
  if (!Number.isSafeInteger(periodId) || periodId < 1 ||
      !Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
    throw new Error('Load and review a persisted roster revision before publishing.');
  }
  if (acknowledgedWarningKeys.some((key) => typeof key !== 'string' || !key || key.length > 128)) {
    throw new Error('Invalid roster warning acknowledgement.');
  }
  const keys = [...new Set(acknowledgedWarningKeys)].sort();
  const signature = JSON.stringify([periodId, expectedRevision, keys]);
  if (previous?.signature === signature) return previous;
  const operationId = allocateId();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId)) {
    throw new Error('A valid publication operation UUID is required.');
  }
  return {
    signature,
    command: {
      period_id: periodId,
      expected_revision: expectedRevision,
      acknowledged_warning_keys: keys,
      operation_id: operationId,
    },
  };
}

/** Minimal persisted period projection needed to review a selected roster. */
export interface ReviewableRosterPeriod {
  period_id?: number;
  id?: number;
  draft_revision: number;
}

/**
 * Use the same request ticket for initialization and validation. A selection change
 * must stop the chain before validation and before a newly initialized period is
 * projected into a different workspace.
 */
export async function reviewRosterSelection<T extends ReviewableRosterPeriod>(options: {
  ticket: import('../utils/asyncScope').AsyncScopeTicket;
  period: T | null;
  initialize: () => Promise<T>;
  validate: (command: RosterValidateCommand) => Promise<RosterValidationResult>;
  onPeriod: (period: T) => void;
}): Promise<{ period: T; validation: RosterValidationResult }> {
  const { ticket } = options;
  ticket.assertCurrent();
  const period = options.period?.period_id || options.period?.id
    ? options.period
    : await ticket.run(options.initialize);
  ticket.assertCurrent();
  const periodId = Number(period.period_id || period.id);
  const revision = Number(period.draft_revision);
  if (!Number.isSafeInteger(periodId) || periodId < 1 ||
      !Number.isSafeInteger(revision) || revision < 1) {
    throw new Error('Load a persisted roster revision before validation.');
  }
  options.onPeriod(period);
  const validation = await ticket.run(() => options.validate({
    period_id: periodId,
    expected_revision: revision,
  }));
  return { period, validation };
}
