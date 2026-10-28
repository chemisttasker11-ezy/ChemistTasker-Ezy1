import { beforeEach, describe, expect, it, vi } from 'vitest';
import ts from 'typescript';
import type { PendingAttendance } from '../../contracts/attendanceRoster';
import { configureApi } from '../../transport/application';
import { attendance } from './api';

const wireRow = {
    provisional_id: 71, session_id: 81, worker_id: 17,
    worker_name: 'Verified Locum', worker_email: 'locum@example.test',
    started_at: '2026-10-29T08:00:00+10:00', ended_at: null,
    cover_type: 'UNBOOKED_LOCUM_COVER', source_membership: null,
    source_pharmacy: null, source_pharmacy_name: null,
    status: 'PENDING', decision_reason: '', created_at: '2026-10-29T08:00:00+10:00',
} as const;
// No cast: the public pending-row contract must accept the new cover type.
const row: PendingAttendance = wireRow;
const clockStatus = {
    has_active_session: true, session_id: 81, pharmacy_id: 9,
    pharmacy_name: 'Cover Pharmacy', started_at: row.started_at,
    is_provisional: true, is_on_break: false, last_event_type: 'CLOCK_IN',
    cover_type: 'UNBOOKED_LOCUM_COVER',
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify([wireRow]), {
        headers: { 'content-type': 'application/json' },
    }));
    configureApi({ baseURL: 'https://example.test/api/v1', getToken: () => 'manager-token', fetchImpl: fetchMock });
});

describe('section L unbooked locum attendance contracts', () => {
    it('lists an unbooked locum with null source membership and pharmacy without dropping or rewriting it', async () => {
        const result = await attendance.getManagerPending(9);
        expect(result).toEqual([wireRow]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://example.test/api/v1/attendance/manager/pending/?pharmacy_id=9');
        expect(request.method).toBe('GET');
        expect(new Headers(request.headers).get('Authorization')).toBe('Bearer manager-token');
    });

    it('preserves worker provisional status and the unbooked cover type', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify(clockStatus), { headers: { 'content-type': 'application/json' } }));
        expect(await attendance.getWorkerStatus()).toEqual(clockStatus);
    });

    it('public pending and worker types accept typed unbooked fixtures', () => {
        // Vitest transpiles without checking types and tsconfig excludes test files.
        // Check these fixtures against the real public contract so this runs in test:ci.
        const filename = ts.sys.resolvePath('src/domains/attendance/__locum_type_fixture__.ts').split('\\').join('/');
        const source = `import type { PendingAttendance, AttendanceWorkerStatus } from '../../contracts/attendanceRoster';
const coverType: PendingAttendance['cover_type'] = 'UNBOOKED_LOCUM_COVER';
const wire = ${JSON.stringify(wireRow)} as const;
const pending: PendingAttendance = wire;
const worker: AttendanceWorkerStatus = ${JSON.stringify(clockStatus)};
void coverType; void pending; void worker;`;
        const options = { strict: true, noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler };
        const host = ts.createCompilerHost(options);
        const getSourceFile = host.getSourceFile.bind(host);
        const fileExists = host.fileExists.bind(host);
        host.getSourceFile = (path, languageVersion, onError, shouldCreateNewSourceFile) => path === filename
            ? ts.createSourceFile(path, source, languageVersion, true)
            : getSourceFile(path, languageVersion, onError, shouldCreateNewSourceFile);
        host.fileExists = path => path === filename || fileExists(path);
        const program = ts.createProgram([filename], options, host);
        const errors = ts.getPreEmitDiagnostics(program).map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        expect(errors, 'Typed unbooked pending/worker fixtures must be accepted by the public contracts').toEqual([]);
    });

    it.each(['UNROSTERED_LOCAL', 'CROSS_SITE_CHAIN', 'CROSS_SITE_ORG'])(
        'keeps existing %s pending cover rows', async coverType => {
            const existing: PendingAttendance = { ...row, cover_type: coverType, source_pharmacy_name: 'Home Pharmacy' };
            fetchMock.mockResolvedValue(new Response(JSON.stringify([existing]), { headers: { 'content-type': 'application/json' } }));
            expect(await attendance.getManagerPending(9)).toEqual([existing]);
        },
    );
});
