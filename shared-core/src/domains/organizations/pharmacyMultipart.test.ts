import { describe, expect, it } from 'vitest';
import { appendPharmacyFormFields } from './pharmacyMultipart';

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
