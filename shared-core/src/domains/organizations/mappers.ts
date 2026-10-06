import type { PharmacyApi } from '../../contracts/organizations';
import type { ChainApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { camelCaseKeysDeep } from '../../utils/serialization';
export const mapPharmacySummaryRecord = (api: PharmacyApi) => camelCaseKeysDeep(api);
export const mapChain = (api: ChainApi) => camelCaseKeysDeep(api);
