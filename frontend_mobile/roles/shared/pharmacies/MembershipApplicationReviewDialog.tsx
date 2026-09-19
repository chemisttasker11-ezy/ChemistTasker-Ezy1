import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
    Button,
    Checkbox,
    Dialog,
    Divider,
    Menu,
    Portal,
    RadioButton,
    Text,
    TextInput,
} from 'react-native-paper';
import {
    approveMembershipApplicationService,
    previewMembershipApplicationAwardService,
    reviewMembershipApplicationService,
    type MembershipApplication,
} from '@chemisttasker/shared-core';
import { surfaceTokens } from './types';

type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CASUAL' | 'LOCUM' | 'SHIFT_HERO';
type PayBasis = 'AWARD' | 'ABOVE_AWARD';

type Props = {
    visible: boolean;
    application: MembershipApplication | null;
    allowedEmploymentTypes: string[];
    defaultEmploymentType: string;
    onDismiss: () => void;
    onUpdated: (application: MembershipApplication) => void;
    onApproved: () => void;
    onNotification?: (message: string, severity: 'success' | 'error') => void;
};

type PartTimeDay = {
    weekday: number;
    label: string;
    enabled: boolean;
    start_time: string;
    end_time: string;
    meal_break_start: string;
    meal_break_minutes: number;
};

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const blankDays = (): PartTimeDay[] =>
    WEEK_DAYS.map((label, weekday) => ({
        weekday,
        label,
        enabled: weekday < 5,
        start_time: '09:00',
        end_time: '17:00',
        meal_break_start: '13:00',
        meal_break_minutes: 30,
    }));

const ROLE_OPTIONS = [
    { value: 'PHARMACIST', label: 'Pharmacist' },
    { value: 'INTERN', label: 'Intern Pharmacist' },
    { value: 'TECHNICIAN', label: 'Dispensary Technician' },
    { value: 'ASSISTANT', label: 'Pharmacy Assistant' },
    { value: 'STUDENT', label: 'Pharmacy Student' },
];

const CLASSIFICATIONS: Record<string, Array<{ value: string; label: string }>> = {
    PHARMACIST: [
        { value: 'PHARMACIST', label: 'Pharmacist' },
        { value: 'EXPERIENCED_PHARMACIST', label: 'Experienced Pharmacist' },
        { value: 'PHARMACIST_IN_CHARGE', label: 'Pharmacist in charge' },
        { value: 'PHARMACIST_MANAGER', label: 'Pharmacist manager' },
    ],
    INTERN: [
        { value: 'FIRST_HALF', label: 'Intern - first half' },
        { value: 'SECOND_HALF', label: 'Intern - second half' },
    ],
    STUDENT: [
        { value: 'YEAR_1', label: 'Student - year 1' },
        { value: 'YEAR_2', label: 'Student - year 2' },
        { value: 'YEAR_3', label: 'Student - year 3' },
        { value: 'YEAR_4', label: 'Student - year 4' },
    ],
    ASSISTANT: [
        { value: 'LEVEL_1', label: 'Pharmacy assistant level 1' },
        { value: 'LEVEL_2', label: 'Pharmacy assistant level 2' },
        { value: 'LEVEL_3', label: 'Pharmacy assistant level 3' },
        { value: 'LEVEL_4', label: 'Pharmacy assistant level 4' },
    ],
    TECHNICIAN: [
        { value: 'LEVEL_3', label: 'Dispensary assistant level 3' },
        { value: 'LEVEL_4', label: 'Level 4 / Certificate IV duties' },
    ],
};

const read = (app: MembershipApplication | null, camelKey: string, snakeKey: string) =>
    app ? ((app as any)[camelKey] ?? (app as any)[snakeKey] ?? '') : '';

const classificationFor = (app: MembershipApplication | null) =>
    String(
        read(app, 'pharmacistAwardLevel', 'pharmacist_award_level')
        || read(app, 'otherstaffClassificationLevel', 'otherstaff_classification_level')
        || read(app, 'internHalf', 'intern_half')
        || read(app, 'studentYear', 'student_year')
        || '',
    );

const firstError = (error: any, fallback: string) => {
    const data = error?.response?.data;
    if (typeof data?.detail === 'string') return data.detail;
    if (data && typeof data === 'object') {
        for (const value of Object.values(data)) {
            if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
            if (typeof value === 'string') return value;
        }
    }
    return error?.message || fallback;
};

const todayIso = () => new Date().toISOString().slice(0, 10);

export default function MembershipApplicationReviewDialog({
    visible,
    application,
    allowedEmploymentTypes,
    defaultEmploymentType,
    onDismiss,
    onUpdated,
    onApproved,
    onNotification,
}: Props) {
    const [localApp, setLocalApp] = useState<MembershipApplication | null>(application);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [role, setRole] = useState('PHARMACIST');
    const [jobTitle, setJobTitle] = useState('');
    const [classification, setClassification] = useState('');
    const [employmentType, setEmploymentType] = useState<EmploymentType>('CASUAL');
    const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
    const [effectiveTo, setEffectiveTo] = useState('');
    const [payBasis, setPayBasis] = useState<PayBasis>('AWARD');
    const [preview, setPreview] = useState<any>(null);
    const [previewError, setPreviewError] = useState('');
    const [rateWeekday, setRateWeekday] = useState('');
    const [rateSaturday, setRateSaturday] = useState('');
    const [rateSunday, setRateSunday] = useState('');
    const [ratePublicHoliday, setRatePublicHoliday] = useState('');
    const [days, setDays] = useState<PartTimeDay[]>(blankDays());
    const [saving, setSaving] = useState(false);
    const [roleMenu, setRoleMenu] = useState(false);
    const [classificationMenu, setClassificationMenu] = useState(false);
    const [employmentMenu, setEmploymentMenu] = useState(false);

    useEffect(() => {
        if (!visible || !application) return;
        setLocalApp(application);
        setFirstName(String(read(application, 'firstName', 'first_name')));
        setLastName(String(read(application, 'lastName', 'last_name')));
        setRole(String(application.role || 'PHARMACIST'));
        setJobTitle(String(read(application, 'jobTitle', 'job_title')));
        setClassification(classificationFor(application));
        const nextEmployment = application.category === 'LOCUM_CASUAL'
            ? (String(application.role).toUpperCase() === 'PHARMACIST' ? 'LOCUM' : 'SHIFT_HERO')
            : (allowedEmploymentTypes.includes(defaultEmploymentType) ? defaultEmploymentType : 'CASUAL');
        setEmploymentType(nextEmployment as EmploymentType);
        setEffectiveFrom(todayIso());
        setEffectiveTo('');
        setPayBasis('AWARD');
        setPreview(null);
        setPreviewError('');
        setRateWeekday('');
        setRateSaturday('');
        setRateSunday('');
        setRatePublicHoliday('');
        setDays(blankDays());
    }, [visible, application, allowedEmploymentTypes, defaultEmploymentType]);

    const payrollEnabled = Boolean(read(localApp, 'payrollEnabled', 'payroll_enabled'));
    const isStaff = localApp?.category === 'FULL_PART_TIME';
    const classificationOptions = CLASSIFICATIONS[role] || [];
    const roleLabel = ROLE_OPTIONS.find((item) => item.value === role)?.label || role;
    const classificationLabel = classificationOptions.find((item) => item.value === classification)?.label || classification;

    useEffect(() => {
        if (!visible || !localApp || !isStaff || !payrollEnabled || !classification || !effectiveFrom) {
            setPreview(null);
            return;
        }
        let cancelled = false;
        setPreviewError('');
        previewMembershipApplicationAwardService(localApp.id, {
            employment_type: employmentType,
            award_classification: classification,
            effective_from: effectiveFrom,
        })
            .then((result: any) => {
                if (cancelled) return;
                setPreview(result);
                if (payBasis === 'ABOVE_AWARD') {
                    setRateWeekday((value) => value || String(result.rateWeekday || ''));
                    setRateSaturday((value) => value || String(result.rateSaturday || ''));
                    setRateSunday((value) => value || String(result.rateSunday || ''));
                    setRatePublicHoliday((value) => value || String(result.ratePublicHoliday || ''));
                }
            })
            .catch((error: any) => {
                if (!cancelled) setPreviewError(firstError(error, 'Unable to resolve Award rates.'));
            });
        return () => {
            cancelled = true;
        };
    }, [visible, localApp, isStaff, payrollEnabled, classification, effectiveFrom, employmentType, payBasis]);

    const updateDay = (weekday: number, patch: Partial<PartTimeDay>) => {
        setDays((current) => current.map((day) => day.weekday === weekday ? { ...day, ...patch } : day));
    };

    const saveReview = async () => {
        if (!localApp) return null;
        const payload = {
            role,
            first_name: firstName.trim(),
            last_name: lastName.trim(),
            job_title: jobTitle.trim(),
            pharmacist_award_level: role === 'PHARMACIST' ? classification || null : null,
            otherstaff_classification_level: ['ASSISTANT', 'TECHNICIAN'].includes(role) ? classification || null : null,
            intern_half: role === 'INTERN' ? classification || null : null,
            student_year: role === 'STUDENT' ? classification || null : null,
        };
        const updated = await reviewMembershipApplicationService(localApp.id, payload);
        setLocalApp(updated);
        onUpdated(updated);
        return updated;
    };

    const saveOnly = async () => {
        setSaving(true);
        try {
            await saveReview();
            onNotification?.('Application review changes saved.', 'success');
        } catch (error: any) {
            onNotification?.(firstError(error, 'Unable to save application review.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const approve = async () => {
        if (!localApp) return;
        setSaving(true);
        try {
            const updated = await saveReview();
            if (!updated) return;
            const payload: any = { employment_type: employmentType };
            if (isStaff && payrollEnabled) {
                const terms: any = {
                    effective_from: effectiveFrom,
                    effective_to: effectiveTo || null,
                    employment_type: employmentType,
                    job_title: jobTitle.trim(),
                    pay_basis: payBasis,
                    award_classification: classification,
                };
                if (employmentType === 'PART_TIME') {
                    terms.ordinary_hours_pattern = {
                        days: days.filter((day) => day.enabled).map((day) => ({
                            weekday: day.weekday,
                            start_time: day.start_time,
                            end_time: day.end_time,
                            meal_break_start: day.meal_break_minutes ? day.meal_break_start : null,
                            meal_break_minutes: day.meal_break_minutes,
                        })),
                    };
                }
                if (payBasis === 'ABOVE_AWARD') {
                    terms.rate_weekday = rateWeekday;
                    terms.rate_saturday = rateSaturday;
                    terms.rate_sunday = rateSunday;
                    terms.rate_public_holiday = ratePublicHoliday;
                    terms.early_morning_applicable = false;
                    terms.late_night_applicable = false;
                }
                payload.employment_engagement = terms;
            }
            await approveMembershipApplicationService(updated.id, payload);
            onNotification?.('Application approved and final terms sent.', 'success');
            onApproved();
            onDismiss();
        } catch (error: any) {
            onNotification?.(firstError(error, 'Unable to approve application.'), 'error');
        } finally {
            setSaving(false);
        }
    };

    const existingChanges = useMemo(
        () => ((localApp as any)?.reviewChanges ?? (localApp as any)?.review_changes ?? []) as any[],
        [localApp],
    );

    const aboveAwardChanged = preview
        ? [rateWeekday, rateSaturday, rateSunday, ratePublicHoliday].some((value, index) => {
            const floor = [preview.rateWeekday, preview.rateSaturday, preview.rateSunday, preview.ratePublicHoliday][index];
            return Number(value || 0) > Number(floor || 0);
        })
        : false;

    const canApprove =
        Boolean(localApp)
        && Boolean(firstName.trim())
        && Boolean(lastName.trim())
        && (!isStaff || Boolean(jobTitle.trim()))
        && (!isStaff || !payrollEnabled || Boolean(classification))
        && (!isStaff || !payrollEnabled || Boolean(preview))
        && (!isStaff || !payrollEnabled || payBasis !== 'ABOVE_AWARD' || aboveAwardChanged)
        && (!isStaff || !payrollEnabled || employmentType !== 'PART_TIME' || days.some((day) => day.enabled))
        && !saving;

    return (
        <Portal>
            <Dialog visible={visible} onDismiss={saving ? undefined : onDismiss}>
                <Dialog.Title>Review membership application</Dialog.Title>
                <Dialog.ScrollArea style={styles.scrollArea}>
                    <ScrollView contentContainerStyle={styles.content}>
                        <Text style={styles.notice}>
                            Email, mobile, date of birth and username are locked after submission. Review edits are recorded and sent to the applicant on approval.
                        </Text>

                        <Text style={styles.sectionTitle}>Locked identifiers</Text>
                        <TextInput label="Email" value={String(localApp?.email || '')} disabled mode="outlined" />
                        <TextInput label="Mobile" value={String(read(localApp, 'mobileNumber', 'mobile_number'))} disabled mode="outlined" />
                        <TextInput label="Date of birth" value={String(read(localApp, 'dateOfBirth', 'date_of_birth'))} disabled mode="outlined" />
                        <TextInput label="Username" value={String(read(localApp, 'username', 'username'))} disabled mode="outlined" />

                        <Divider />
                        <Text style={styles.sectionTitle}>Reviewed details</Text>
                        <TextInput label="First name" value={firstName} onChangeText={setFirstName} mode="outlined" />
                        <TextInput label="Last name" value={lastName} onChangeText={setLastName} mode="outlined" />

                        <Menu
                            visible={roleMenu}
                            onDismiss={() => setRoleMenu(false)}
                            anchor={<Button mode="outlined" onPress={() => setRoleMenu(true)}>Role: {roleLabel}</Button>}
                        >
                            {ROLE_OPTIONS.map((option) => (
                                <Menu.Item
                                    key={option.value}
                                    title={option.label}
                                    onPress={() => {
                                        setRole(option.value);
                                        setClassification('');
                                        setRoleMenu(false);
                                    }}
                                />
                            ))}
                        </Menu>

                        {isStaff ? <TextInput label="Job title" value={jobTitle} onChangeText={setJobTitle} mode="outlined" /> : null}

                        {isStaff && payrollEnabled ? (
                            <Menu
                                visible={classificationMenu}
                                onDismiss={() => setClassificationMenu(false)}
                                anchor={<Button mode="outlined" onPress={() => setClassificationMenu(true)}>Classification: {classificationLabel || 'Select'}</Button>}
                            >
                                {classificationOptions.map((option) => (
                                    <Menu.Item
                                        key={option.value}
                                        title={option.label}
                                        onPress={() => {
                                            setClassification(option.value);
                                            setClassificationMenu(false);
                                        }}
                                    />
                                ))}
                            </Menu>
                        ) : null}

                        <Menu
                            visible={employmentMenu}
                            onDismiss={() => setEmploymentMenu(false)}
                            anchor={<Button mode="outlined" onPress={() => setEmploymentMenu(true)}>{isStaff ? 'Employment' : 'Favourite'}: {employmentType.replace(/_/g, ' ')}</Button>}
                        >
                            {(isStaff ? allowedEmploymentTypes : ['LOCUM', 'SHIFT_HERO']).map((type) => (
                                <Menu.Item
                                    key={type}
                                    title={String(type).replace(/_/g, ' ')}
                                    onPress={() => {
                                        setEmploymentType(type as EmploymentType);
                                        setEmploymentMenu(false);
                                    }}
                                />
                            ))}
                        </Menu>

                        {existingChanges.length ? (
                            <Text style={styles.warning}>
                                {existingChanges.length} review change(s) already recorded. The full change list will be included in the approval notification.
                            </Text>
                        ) : null}

                        {isStaff && !payrollEnabled ? (
                            <Text style={styles.success}>
                                ChemistTasker Payroll is disabled. No Award classification or rates are required; roster, attendance and timesheets continue for the pharmacy's own payroll.
                            </Text>
                        ) : null}

                        {!isStaff ? (
                            <Text style={styles.notice}>
                                Favourite membership has no standing rate. The posted or negotiated rate and ABN/TFN terms are accepted per shift.
                            </Text>
                        ) : null}

                        {isStaff && payrollEnabled ? (
                            <>
                                <Divider />
                                <Text style={styles.sectionTitle}>Initial payroll terms</Text>
                                <TextInput label="Effective from (YYYY-MM-DD)" value={effectiveFrom} onChangeText={setEffectiveFrom} mode="outlined" />
                                <TextInput label="Effective to - optional" value={effectiveTo} onChangeText={setEffectiveTo} mode="outlined" />

                                <RadioButton.Group value={payBasis} onValueChange={(value) => setPayBasis(value as PayBasis)}>
                                    <RadioButton.Item label="Award rate" value="AWARD" />
                                    <RadioButton.Item label="Above award / agreed rates" value="ABOVE_AWARD" />
                                </RadioButton.Group>

                                {previewError ? <Text style={styles.error}>{previewError}</Text> : null}
                                {preview ? (
                                    <Text style={styles.notice}>
                                        Award floor: weekday AUD {preview.rateWeekday}/hr · Saturday AUD {preview.rateSaturday}/hr · Sunday AUD {preview.rateSunday}/hr · public holiday AUD {preview.ratePublicHoliday}/hr
                                    </Text>
                                ) : null}

                                {payBasis === 'ABOVE_AWARD' ? (
                                    <>
                                        <TextInput keyboardType="decimal-pad" label="Agreed weekday rate" value={rateWeekday} onChangeText={setRateWeekday} mode="outlined" />
                                        <TextInput keyboardType="decimal-pad" label="Agreed Saturday rate" value={rateSaturday} onChangeText={setRateSaturday} mode="outlined" />
                                        <TextInput keyboardType="decimal-pad" label="Agreed Sunday rate" value={rateSunday} onChangeText={setRateSunday} mode="outlined" />
                                        <TextInput keyboardType="decimal-pad" label="Agreed public holiday rate" value={ratePublicHoliday} onChangeText={setRatePublicHoliday} mode="outlined" />
                                        {!aboveAwardChanged && preview ? <Text style={styles.warning}>At least one agreed rate must be above the Award floor.</Text> : null}
                                    </>
                                ) : null}

                                {employmentType === 'PART_TIME' ? (
                                    <>
                                        <Text style={styles.sectionTitle}>Agreed ordinary hours</Text>
                                        {days.map((day) => (
                                            <View key={day.weekday} style={styles.dayCard}>
                                                <Checkbox.Item
                                                    label={day.label}
                                                    status={day.enabled ? 'checked' : 'unchecked'}
                                                    onPress={() => updateDay(day.weekday, { enabled: !day.enabled })}
                                                    position="leading"
                                                />
                                                {day.enabled ? (
                                                    <>
                                                        <TextInput label="Start" value={day.start_time} onChangeText={(value) => updateDay(day.weekday, { start_time: value })} mode="outlined" />
                                                        <TextInput label="Finish" value={day.end_time} onChangeText={(value) => updateDay(day.weekday, { end_time: value })} mode="outlined" />
                                                        <TextInput label="Meal break starts" value={day.meal_break_start} onChangeText={(value) => updateDay(day.weekday, { meal_break_start: value })} mode="outlined" />
                                                        <RadioButton.Group
                                                            value={String(day.meal_break_minutes)}
                                                            onValueChange={(value) => updateDay(day.weekday, { meal_break_minutes: Number(value) })}
                                                        >
                                                            <View style={styles.breakRow}>
                                                                {[0, 30, 45, 60].map((minutes) => (
                                                                    <RadioButton.Item key={minutes} label={minutes ? String(minutes) + 'm' : 'None'} value={String(minutes)} style={styles.breakItem} />
                                                                ))}
                                                            </View>
                                                        </RadioButton.Group>
                                                    </>
                                                ) : null}
                                            </View>
                                        ))}
                                    </>
                                ) : null}
                            </>
                        ) : null}
                    </ScrollView>
                </Dialog.ScrollArea>
                <Dialog.Actions>
                    <Button onPress={onDismiss} disabled={saving}>Cancel</Button>
                    <Button onPress={saveOnly} disabled={saving}>Save review</Button>
                    <Button mode="contained" onPress={approve} loading={saving} disabled={!canApprove}>Approve & send</Button>
                </Dialog.Actions>
            </Dialog>
        </Portal>
    );
}

const styles = StyleSheet.create({
    scrollArea: { maxHeight: 650 },
    content: { paddingVertical: 16, gap: 12 },
    sectionTitle: { fontSize: 16, fontWeight: '700', marginTop: 4 },
    notice: { color: surfaceTokens.textMuted, lineHeight: 20 },
    success: { color: '#166534', lineHeight: 20 },
    warning: { color: '#92400E', lineHeight: 20 },
    error: { color: surfaceTokens.error, lineHeight: 20 },
    dayCard: { borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 8, gap: 8 },
    breakRow: { flexDirection: 'row', flexWrap: 'wrap' },
    breakItem: { minWidth: 100 },
});
