'use client';
import { createContentOperations } from '@chemisttasker/shared-core';
import { chemistTaskerApi } from './chemisttasker-api';
export { csrfToken } from '../shared/browser-session';

/** Named Content Workspace domain methods, retaining the existing Next BFF transport. */
export const contentOperations = createContentOperations(chemistTaskerApi);
