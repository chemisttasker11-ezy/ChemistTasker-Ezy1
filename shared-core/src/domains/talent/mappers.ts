import type { UserAvailabilityApi } from '../../types';
/** Domain-owned operations extracted from the established shared API. */
import { camelCaseKeysDeep } from '../../utils/serialization';
export const mapUserAvailability = (api: UserAvailabilityApi) => camelCaseKeysDeep(api);
