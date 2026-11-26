import { browserCsrfToken } from '@chemisttasker/shared-core';

export const getBrowserCsrfToken = (baseUrl: string) => browserCsrfToken({ baseUrl });
