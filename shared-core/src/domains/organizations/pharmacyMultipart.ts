/** Canonical pharmacy multipart scalar encoding shared by native and browser clients.
 * Django's JSONField expects a single JSON value for an array, not repeated
 * multipart values with the same key. Native file objects stay platform-owned.
 */
export function appendPharmacyFormFields(
    formData: { append(name: string, value: string): void },
    payload: Record<string, unknown>,
): void {
    for (const [key, value] of Object.entries(payload)) {
        if (value === null || value === undefined) continue;
        formData.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
    }
}

/**
 * Verify a successful pharmacy write independently of the HTTP response.
 * The server assigns opaque (sometimes hashed) storage names: compare the
 * canonical persisted path, never the original local picker filename.
 *
 * This cannot replace a native upload or storage-byte test. Those remain
 * server/device acceptance responsibilities.
 */
export type PharmacyDocumentField =
    | 'methadone_s8_protocols' | 'sops' | 'induction_guides' | 'qld_sump_docs';

const pharmacyDocuments: PharmacyDocumentField[] = [
    'methadone_s8_protocols', 'sops', 'induction_guides', 'qld_sump_docs',
];
const pharmacyLists = ['employment_types', 'roles_needed', 'software', 'services'] as const;

function canonicalDocumentPath(value: unknown): string | null {
    if (typeof value !== 'string' || !value.trim()) return null;
    try {
        return decodeURI(new URL(value, 'https://pharmacy-file.local.invalid/').pathname);
    } catch {
        return value.split('?')[0].trim() || null;
    }
}

export interface PharmacyWriteVerification {
    persistedId: number | string;
    submitted: Record<string, unknown>;
    uploadedFields: readonly PharmacyDocumentField[];
    previousDocumentUrls?: Partial<Record<PharmacyDocumentField, string | null>>;
}

export function verifyPharmacyWriteReadback(
    persisted: Record<string, unknown> | null | undefined,
    expected: PharmacyWriteVerification,
): void {
    if (!persisted || String(persisted.id ?? '') !== String(expected.persistedId)) {
        throw new Error('Saved pharmacy could not be verified. Retry verification without resubmitting.');
    }
    for (const key of pharmacyLists) {
        const selected = expected.submitted[key];
        if (Array.isArray(selected) && JSON.stringify(persisted[key]) !== JSON.stringify(selected)) {
            throw new Error(`Saved pharmacy ${key} did not match the submitted selection.`);
        }
    }
    for (const key of pharmacyDocuments) {
        if (!expected.uploadedFields.includes(key)) continue;
        const current = canonicalDocumentPath(persisted[key]);
        if (!current) throw new Error(`Saved document ${key} was not returned by the server.`);
        const previous = canonicalDocumentPath(expected.previousDocumentUrls?.[key]);
        if (previous && previous === current) {
            throw new Error(`Saved document ${key} still refers to the previous file. Retry verification before making another upload.`);
        }
    }
}
