import type { OpenShiftApi, RosterAssignmentApi, RosterPharmacyMemberApi, WorkerShiftRequestApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { camelCaseKeysDeep } from '../../utils/serialization';
import type { RosterPharmacyMember, WorkerShiftRequest } from '../../types';
export const mapRosterAssignment = (api: RosterAssignmentApi) => camelCaseKeysDeep(api);
export const mapWorkerShiftRequest = (api: WorkerShiftRequestApi): WorkerShiftRequest => camelCaseKeysDeep(api);
export const mapOpenShift = (api: OpenShiftApi) => camelCaseKeysDeep(api);
export const mapRosterPharmacyMember = (api: RosterPharmacyMemberApi): RosterPharmacyMember => camelCaseKeysDeep(api);
