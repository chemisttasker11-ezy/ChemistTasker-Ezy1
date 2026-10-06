import type { Collection } from '../../contracts/common';
import type { PillBalanceApi, PillRewardRuleApi, PillReferralCodeApi, PillLedgerEntryApi, PillReferralEventApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { fetchApi } from '../../transport/application';
import { buildQuery } from '../../utils/serialization';
export async function fetchPillBalanceService() {
    return fetchApi<PillBalanceApi>('/pill-rewards/balance/');
}
export async function fetchPillRewardRulesService() {
    return fetchApi<Collection<PillRewardRuleApi>>('/pill-rewards/rules/');
}
export async function fetchPillReferralCodeService() {
    return fetchApi<PillReferralCodeApi>('/pill-rewards/referral-code/');
}
export async function fetchPillHistoryService(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<PillLedgerEntryApi>>(`/pill-rewards/history/${query}`);
}
export async function fetchPillReferralsService(params?: Record<string, unknown>) {
    const query = buildQuery(params);
    return fetchApi<Collection<PillReferralEventApi>>(`/pill-rewards/referrals/${query}`);
}
export async function createFriendPillReferralService(payload: Record<string, unknown>) {
    return fetchApi('/pill-rewards/refer-friend/', {
        method: 'POST',
        body: payload,
    });
}
export async function createShiftPillReferralService(payload: Record<string, unknown>) {
    return fetchApi('/pill-rewards/refer-shift/', {
        method: 'POST',
        body: payload,
    });
}
export async function claimPillReferralService(payload: Record<string, unknown>) {
    return fetchApi('/pill-rewards/claim/', {
        method: 'POST',
        body: payload,
    });
}
