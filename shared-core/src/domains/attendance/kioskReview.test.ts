import { beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApi } from '../../transport/application';
import { attendance } from './api';

const row = {
    event_id: 'c0443a0b-482c-4ef5-973d-432e939cc058', employee_id: 17,
    worker_name: 'Casey Worker', event_type: 'CLOCK_IN', device_id: 4,
    device_name: 'Windows Counter', pharmacy_timezone: 'Australia/Brisbane',
    device_timestamp: '2026-10-28T07:30:00+10:00',
    trusted_time_estimate: '2026-10-28T08:00:00+10:00',
    received_at: '2026-10-28T08:10:00+10:00', integrity_flags: ['CLOCK_ANCHOR_DRIFT'],
    can_approve: true, approval_block_reason: null,
};
type Decision = {
    event_id: string; decision: 'APPROVED' | 'REJECTED'; reason: string; corrected_timestamp?: string;
};
type ReviewOperations = {
    getManagerPendingKioskReviews(pharmacyId: number | string): Promise<typeof row[]>;
    decideKioskReview(payload: Decision): Promise<{
        decision: string; review_id: number; attendance_event_id: number | null;
    }>;
};

function reviewApi(): ReviewOperations {
    expect(attendance, 'T3 must expose the planned manager evidence operations')
        .toHaveProperty('getManagerPendingKioskReviews', expect.any(Function));
    expect(attendance).toHaveProperty('decideKioskReview', expect.any(Function));
    return attendance as typeof attendance & ReviewOperations;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
    fetchMock = vi.fn(async () => new Response(JSON.stringify([row]), {
        headers: { 'content-type': 'application/json' },
    }));
    configureApi({
        baseURL: 'https://example.test/api/v1', getToken: () => 'manager-token', fetchImpl: fetchMock,
    });
});

describe('PR-B operational kiosk review request contracts', () => {
    it('lists only the requested pharmacy and preserves the safe review projection', async () => {
        const result = await reviewApi().getManagerPendingKioskReviews('9');
        expect(result).toEqual([row]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://example.test/api/v1/attendance/manager/kiosk-review/pending/?pharmacy_id=9');
        expect(request.method).toBe('GET');
        expect(request.body).toBeUndefined();
        expect(new Headers(request.headers).get('Authorization')).toBe('Bearer manager-token');
    });

    it('posts approval UUID, corrected offset timestamp and justification without changing signed evidence', async () => {
        const response = { decision: 'APPROVED', review_id: 21, attendance_event_id: 33 };
        fetchMock.mockResolvedValue(new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }));
        const payload: Decision = {
            event_id: row.event_id, decision: 'APPROVED', reason: 'Checked shift record.',
            corrected_timestamp: '2026-10-28T08:00:00+10:00',
        };
        expect(await reviewApi().decideKioskReview(payload)).toEqual(response);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://example.test/api/v1/attendance/manager/kiosk-review/decide/');
        expect(request.method).toBe('POST');
        expect(JSON.parse(String(request.body))).toEqual(payload);
        expect(new Headers(request.headers).get('Authorization')).toBe('Bearer manager-token');
        expect(payload.corrected_timestamp).toBe('2026-10-28T08:00:00+10:00');
    });

    it('posts rejection with a reason and no corrected timestamp', async () => {
        const response = { decision: 'REJECTED', review_id: 22, attendance_event_id: null };
        fetchMock.mockResolvedValue(new Response(JSON.stringify(response), { headers: { 'content-type': 'application/json' } }));
        const payload: Decision = { event_id: row.event_id, decision: 'REJECTED', reason: 'Time could not be established.' };
        expect(await reviewApi().decideKioskReview(payload)).toEqual(response);
        const [url, request] = fetchMock.mock.calls[0];
        expect(String(url)).toBe('https://example.test/api/v1/attendance/manager/kiosk-review/decide/');
        expect(request.method).toBe('POST');
        expect(JSON.parse(String(request.body))).toEqual(payload);
    });

    it.each(['DEVICE_REVOKED', 'UNTRUSTWORTHY_DEVICE_EVIDENCE', 'REVIEW_ALREADY_DECIDED'])(
        'preserves 409 %s for the review dialog without retrying the decision', async (code) => {
            fetchMock.mockResolvedValue(new Response(JSON.stringify({ code }), {
                status: 409, headers: { 'content-type': 'application/json' },
            }));
            await expect(reviewApi().decideKioskReview({
                event_id: row.event_id, decision: 'APPROVED', reason: 'Checked.',
                corrected_timestamp: '2026-10-28T08:00:00+10:00',
            })).rejects.toMatchObject({ status: 409, payload: { code } });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        },
    );

    it('propagates forbidden pharmacy access instead of presenting an empty queue', async () => {
        fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'Not authorized for this pharmacy.' }), {
            status: 403, headers: { 'content-type': 'application/json' },
        }));
        await expect(reviewApi().getManagerPendingKioskReviews(99)).rejects.toMatchObject({ status: 403 });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
