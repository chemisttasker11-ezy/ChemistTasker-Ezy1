import { beforeEach, expect, it, vi } from 'vitest';
import ts from 'typescript';
import { configureApi } from '../../transport/application';
import { attendance } from './api';

const terms = {
    version: 1, acceptance_required: true, settlement_channel: 'INVOICE',
    engagement_kind: 'INDEPENDENT_CONTRACTOR', payment_preference: 'ABN',
    worker_id: 17, provider_abn: '51824753556', accepted_at: null,
    occurrences: [{ slot_id: 31, date: '2026-10-29', start_time: '08:00:00', end_time: '10:00:00', agreed_rate: '73.50' }],
};
const row = {
    assignment_id: 41, provisional_id: 71, session_id: 81, pharmacy_id: 9,
    pharmacy_name: 'Cover Pharmacy', cover_type: 'UNBOOKED_LOCUM_COVER', status: 'APPROVED',
    engagement_terms_accepted_at: null, engagement_terms_preview: terms,
};
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify([row]), { headers: { 'content-type': 'application/json' } }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'worker-token', fetchImpl: fetchMock });
});

function operation(name: string): (...args: any[]) => Promise<any> {
    const fn = (attendance as unknown as Record<string, unknown>)[name];
    expect(typeof fn, `Missing attendance.${name} public operation`).toBe('function');
    return fn as (...args: any[]) => Promise<any>;
}

it('discovers closed approved cover through authenticated GET without destination scope', async () => {
    expect(await operation('getWorkerCoverTerms')()).toEqual([row]);
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://example.test/api/v1/attendance/worker/cover-terms/');
    expect(request.method).toBe('GET');
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer worker-token');
    expect(request.body).toBeUndefined();
});

it('accepts an assignment using only both existing dialog consents as JSON booleans', async () => {
    const accepted = { ...row, engagement_terms_accepted_at: '2026-10-29T01:00:00Z' };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(accepted), { headers: { 'content-type': 'application/json' } }));
    const result = await operation('acceptWorkerCoverTerms')(41, {
        engagementTermsAccepted: true, independentContractorStatusConfirmed: true,
    });
    expect(result).toEqual(accepted);
    const [url, request] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://example.test/api/v1/attendance/worker/cover-terms/41/accept/');
    expect(request.method).toBe('POST');
    expect(JSON.parse(request.body)).toEqual({ engagement_terms_accepted: true, independent_contractor_status_confirmed: true });
    expect(new Headers(request.headers).get('Authorization')).toBe('Bearer worker-token');
});

it('preserves false consent values instead of coercing them into acceptance', async () => {
    await operation('acceptWorkerCoverTerms')(41, { engagementTermsAccepted: true, independentContractorStatusConfirmed: false });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ engagement_terms_accepted: true, independent_contractor_status_confirmed: false });
});

it('preserves incomplete-profile notice and TIMESHEET_ONLY routing for the client', async () => {
    const incomplete = { ...row, engagement_terms_preview: { ...terms, blocked: true, settlement_channel: 'TIMESHEET_ONLY', notice: 'Worker payment details are incomplete.' } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify([incomplete]), { headers: { 'content-type': 'application/json' } }));
    expect(await operation('getWorkerCoverTerms')()).toEqual([incomplete]);
});

it('preserves the current backend accepted LIST shape without inventing a top-level timestamp', async () => {
    const { engagement_terms_accepted_at: _missingOnBackend, ...backendRow } = row;
    const accepted = { ...backendRow, engagement_terms_preview: {
        ...terms, blocked: false, accepted_at: '2026-10-29T01:00:00+00:00', accepted_by_user_id: 17,
    } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify([accepted]), { headers: { 'content-type': 'application/json' } }));
    const [result] = await operation('getWorkerCoverTerms')();
    expect(result).toEqual(accepted);
    expect(result.engagement_terms_preview.accepted_at).toBe('2026-10-29T01:00:00+00:00');
    expect(result).not.toHaveProperty('engagement_terms_accepted_at');
});

for (const [label, channel, kind, incomplete] of [
    ['incomplete ABN', 'TIMESHEET_ONLY', 'INDEPENDENT_CONTRACTOR', true],
    ['staff', 'TIMESHEET_ONLY', 'STAFF_EMPLOYMENT', false],
    ['TFN', 'TIMESHEET_ONLY', 'SHIFT_EMPLOYMENT', false],
    ['payroll', 'PAYROLL', 'STAFF_EMPLOYMENT', false],
] as const) {
    it(`preserves the explicit payment profile flag for ${label} without treating blocked as incomplete`, async () => {
        const blocked = { ...row, engagement_terms_preview: {
            settlement_channel: channel, engagement_kind: kind, blocked: true,
            payment_profile_incomplete: incomplete, accepted_at: null, occurrences: terms.occurrences,
        } };
        fetchMock.mockResolvedValue(new Response(JSON.stringify([blocked]), { headers: { 'content-type': 'application/json' } }));
        const [result] = await operation('getWorkerCoverTerms')();
        expect(result).toEqual(blocked);
        expect(result.engagement_terms_preview.payment_profile_incomplete).toBe(incomplete);
    });
}

it('propagates accept errors so attendance can show a visible retry', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Review not approved' }), { status: 400, headers: { 'content-type': 'application/json' } }));
    await expect(operation('acceptWorkerCoverTerms')(41, { engagementTermsAccepted: true, independentContractorStatusConfirmed: true })).rejects.toThrow();
});

it('public attendance operations have typed preview and consent contracts', () => {
    const filename = ts.sys.resolvePath('src/domains/attendance/__cover_terms_type_fixture__.ts').replaceAll('\\', '/');
    const source = `import { attendance } from './api';
type Row = Awaited<ReturnType<typeof attendance.getWorkerCoverTerms>>[number];
const row: Row = ${JSON.stringify(row)};
const payload: Parameters<typeof attendance.acceptWorkerCoverTerms>[1] = { engagementTermsAccepted: true, independentContractorStatusConfirmed: true };
const rate: string | null | undefined = row.engagement_terms_preview.occurrences[0].agreed_rate;
// @ts-expect-error Consent must remain boolean, not a truthy string.
const invalid: Parameters<typeof attendance.acceptWorkerCoverTerms>[1] = { engagementTermsAccepted: 'yes' };
void invalid;
void row; void payload; void rate;`;
    const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2021, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    const exists = host.fileExists.bind(host);
    host.getSourceFile = (path, version, error, fresh) => path === filename ? ts.createSourceFile(path, source, version, true) : original(path, version, error, fresh);
    host.fileExists = path => path === filename || exists(path);
    const program = ts.createProgram([filename], options, host);
    expect(ts.getPreEmitDiagnostics(program).map(error => ts.flattenDiagnosticMessageText(error.messageText, '\n'))).toEqual([]);
});

it('existing worker status contract still returns no active session', async () => {
    const status = { has_active_session: false, session_id: null, cover_type: null };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(status), { headers: { 'content-type': 'application/json' } }));
    expect(await attendance.getWorkerStatus()).toEqual(status);
});
