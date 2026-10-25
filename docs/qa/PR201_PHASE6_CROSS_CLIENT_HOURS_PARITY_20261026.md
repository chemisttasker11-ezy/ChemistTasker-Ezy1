# Vite, Next and Expo pharmacy-hours presentation parity

Prior to this commit, Vite/Next used
`frontend_web/shared/postShift/helpers.ts.pharmacyHoursForDate`,
while Expo used a separate near-copy at
`frontend_mobile/roles/shared/shifts/PostShiftScreen.helpers.ts`.
They both consumed the shared-core holiday resolver but independently
selected opening hours, weekday/holiday labels and closure flags.

The entire presentation policy is now one pure shared-core function
`getPharmacyHoursForDate` alongside `getPharmacyHolidayInfo`.
Both web and native adapters are thin typed wrappers with no rule logic.
Part-day windows, pending-year status and label are included in the
same result so client screens can display them, but no client may
calculate Award penalty rates or choose council boundaries.

Source-backed data contract tests cover Gold Coast Show vs Brisbane,
Queensland Christmas Eve 18:00 part-day, pending 2027/local published 2026,
camelCase legacy aliases and store closure flags. Cross-client TypeScript
builds and real-device visual acceptance are still separate gates.
No source holiday calendars, migrations or backend wage rates touched.
