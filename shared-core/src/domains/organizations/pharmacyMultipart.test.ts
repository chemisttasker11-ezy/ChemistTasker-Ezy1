import { describe, expect, it } from 'vitest';
import { appendPharmacyFormFields, verifyPharmacyWriteReadback } from './pharmacyMultipart';

function collect(payload: Record<string, unknown>) {
    const fields: Array<[string, string]> = [];
    appendPharmacyFormFields({ append: (key, value) => fields.push([key, value]) }, payload);
    return fields;
}

describe('pharmacy multipart fields (Django JSONField contract)', () => {
    it('encodes each multi-choice field exactly once as a JSON array', () => {
        const fields = collect({
            employment_types: ['PART_TIME', 'LOCUMS'],
            roles_needed: ['PHARMACIST', 'INTERN'],
            software: ['FRED_DISPENSE', 'MINFOS'],
            services: ['VACCINATION', 'DAA'],
        });
        expect(fields).toHaveLength(4);
        for (const [key, value] of fields) {
            expect(key).toBeTruthy();
            expect(JSON.parse(value)).toHaveLength(2);
        }
        expect(fields).toContainEqual(['employment_types', '["PART_TIME","LOCUMS"]']);
        expect(fields).toContainEqual(['roles_needed', '["PHARMACIST","INTERN"]']);
    });

    it('preserves empty arrays, explicit false, zero and ordinary strings', () => {
        expect(collect({
            employment_types: [],
            roles_needed: [],
            auto_publish_worker_requests: false,
            rate_weekday: 0,
            name: 'Chemist Ezy',
            not_supplied: null,
            also_absent: undefined,
        })).toEqual([
            ['employment_types', '[]'],
            ['roles_needed', '[]'],
            ['auto_publish_worker_requests', 'false'],
            ['rate_weekday', '0'],
            ['name', 'Chemist Ezy'],
        ]);
    });

    it('does not add duplicate multipart keys when lists contain multiple entries', () => {
        const fields = collect({ employment_types: ['PART_TIME', 'FULL_TIME', 'LOCUMS'] });
        expect(fields.filter(([key]) => key === 'employment_types')).toHaveLength(1);
        expect(JSON.parse(fields[0][1])).toEqual(['PART_TIME', 'FULL_TIME', 'LOCUMS']);
    });
});

describe('persisted pharmacy file replacement identity and retry safety', () => {
    const expected = {
        persistedId: '42',
        submitted: { employment_types: ['LOCUMS'], roles_needed: [] },
        uploadedFields: ['methadone_s8_protocols'] as const,
        previousDocumentUrls: { methadone_s8_protocols: 'https://example.test/media/pharmacies/42/previous.pdf?key=1' },
    };
    it('accepts hashed, newly persisted file references and checked JSON arrays', () => {
        expect(() => verifyPharmacyWriteReadback({
            id: 42, employment_types: ['LOCUMS'], roles_needed: [],
            methadone_s8_protocols: '/media/pharmacies/42/3efbf7.pdf',
        }, expected)).not.toThrow();
    });
    it('rejects unchanged old document even though it is nonempty', () => {
        expect(() => verifyPharmacyWriteReadback({
            id: 42, employment_types: ['LOCUMS'], roles_needed: [],
            methadone_s8_protocols: '/media/pharmacies/42/previous.pdf?cache=2',
        }, expected)).toThrow(/still refers to the previous file/);
    });
    it('rejects missing documents, incorrect identity and silently lost selections', () => {
        const good = { id: 42, employment_types: ['LOCUMS'], roles_needed: [], methadone_s8_protocols: '/media/new.pdf' };
        expect(() => verifyPharmacyWriteReadback({ ...good, id: 43 }, expected)).toThrow(/could not be verified/);
        expect(() => verifyPharmacyWriteReadback({ ...good, methadone_s8_protocols: null }, expected)).toThrow(/was not returned/);
        expect(() => verifyPharmacyWriteReadback({ ...good, employment_types: [] }, expected)).toThrow(/employment_types/);
    });
    it('does not mistake unchanged existing files for new uploads when no file was chosen', () => {
        expect(() => verifyPharmacyWriteReadback({
            id: 42, employment_types: ['LOCUMS'], roles_needed: [],
            methadone_s8_protocols: '/media/pharmacies/42/previous.pdf',
        }, { ...expected, uploadedFields: [] })).not.toThrow();
    });
});
