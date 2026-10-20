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
