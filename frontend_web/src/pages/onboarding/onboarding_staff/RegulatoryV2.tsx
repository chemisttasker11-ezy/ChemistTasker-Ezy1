// Role & qualifications (Pharmacy team). Required: the role, its classification or year, and an intern's AHPRA number.
// Every document is optional evidence: it earns a badge once checked and never blocks saving.
// Server: tab="regulatory"; fields as on the model (role_type, classification_level, student_year,
// dispensary_qualification, ahpra_number, certificate, university_id, cpr_certificate, s8_certificate).
import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Link, MenuItem, Snackbar, Stack, TextField, Typography } from "@mui/material";
import { FileUp } from "lucide-react";
import {
  dispensaryQualifications,
  getOnboardingDetail,
  normalizeVerification,
  otherStaffQualificationLevels,
  updateOnboardingForm,
  verificationRows,
  type VerificationRow,
} from "@chemisttasker/shared-core";
import { EvidencePill } from "@chemisttasker/shared-ui/VerificationBadges";
import { API_BASE_URL } from "../../../constants/api";
import { useUnsavedChangesGuard } from "../../../hooks/useUnsavedChangesGuard";
import { announceOnboardingSaved } from '../OnboardingShell';

type Role = "INTERN" | "TECHNICIAN" | "ASSISTANT" | "STUDENT" | "";
type FileField = "certificate" | "university_id" | "cpr_certificate" | "s8_certificate";

type FormState = {
  role_type: Role;
  classification_level: string;
  dispensary_qualification: string;
  student_year: string;
  ahpra_number: string;
  ahpra_verified: boolean;
  files: Partial<Record<FileField, File | null>>;
  existing: Partial<Record<FileField, string>>;
};

const ROLE_CHOICES = [
  { value: "ASSISTANT", label: "Pharmacy Assistant" },
  { value: "TECHNICIAN", label: "Dispensary Technician" },
  { value: "INTERN", label: "Intern Pharmacist" },
  { value: "STUDENT", label: "Pharmacy Student" },
];

const STUDENT_YEAR_CHOICES = [
  { value: "YEAR_1", label: "1st year" },
  { value: "YEAR_2", label: "2nd year" },
  { value: "YEAR_3", label: "3rd year" },
  { value: "YEAR_4", label: "4th year" },
];

const fileUrl = (path?: string) => (!path ? "" : path.startsWith("http") ? path : `${API_BASE_URL}${path}`);

const EMPTY: FormState = { role_type: "", classification_level: "", dispensary_qualification: "", student_year: "", ahpra_number: "", ahpra_verified: false, files: {}, existing: {} };

function fromServer(d: any): FormState {
  return {
    role_type: (d.role_type as Role) || "",
    classification_level: d.classification_level || "",
    dispensary_qualification: d.dispensary_qualification || "",
    student_year: d.student_year || "",
    ahpra_number: d.ahpra_number || "",
    ahpra_verified: d.ahpra_verified === true,
    files: {},
    existing: { certificate: d.certificate || "", university_id: d.university_id || "", cpr_certificate: d.cpr_certificate || "", s8_certificate: d.s8_certificate || "" },
  };
}

function EvidenceRow({ title, purpose, field, form, badge, onPick }: {
  title: string;
  purpose: string;
  field: FileField;
  form: FormState;
  badge?: VerificationRow;
  onPick: (field: FileField, file: File | null) => void;
}) {
  const picked = form.files[field];
  const existing = form.existing[field];
  return (
    <Box sx={{ p: 1.75, borderRadius: "14px", border: "1px solid var(--ct-border-color)" }}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} justifyContent="space-between" alignItems={{ sm: "center" }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography sx={{ fontSize: 14.5, fontWeight: 600, color: "var(--ct-text-primary)" }}>{title}</Typography>
          <Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)", mt: 0.25, lineHeight: 1.45 }}>{purpose}</Typography>
        </Box>
        {badge && !picked && <EvidencePill code={badge.code} label={badge.label} state={badge.state} explainer={badge.explainer} />}
      </Stack>
      <Stack direction="row" spacing={1.5} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mt: 1.25 }}>
        <Button variant="outlined" size="small" component="label" startIcon={<FileUp size={16} />}>
          {picked ? "Change file" : existing ? "Replace file" : "Add file"}
          <input hidden type="file" accept="image/*,.pdf" onChange={event => onPick(field, event.target.files?.[0] ?? null)} />
        </Button>
        {picked && <Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)" }}>{picked.name} · save to send it for checking</Typography>}
        {!picked && existing && <Link href={fileUrl(existing)} target="_blank" rel="noopener noreferrer" sx={{ fontSize: 13.5 }}>View current file</Link>}
      </Stack>
    </Box>
  );
}

export default function RegulatoryV2() {
  const roleKey = "otherstaff";
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [badges, setBadges] = useState<VerificationRow[]>([]);
  const [data, setData] = useState<FormState>(EMPTY);
  const unsaved = useUnsavedChangesGuard({ disabled: loading || saving, value: data });

  const accept = (d: any) => {
    const next = fromServer(d);
    setData(next);
    unsaved.markClean(next);
    setBadges(verificationRows(normalizeVerification(d.verification), "worker"));
  };

  useEffect(() => {
    let live = true;
    getOnboardingDetail(roleKey)
      .then(d => { if (live) accept(d || {}); })
      .catch((err: any) => { if (live && err.response?.status !== 404) setError("We couldn't load your role details. Refresh the page to try again."); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (patch: Partial<FormState>) => setData(prev => ({ ...prev, ...patch }));
  const pick = (field: FileField, file: File | null) => setData(prev => ({ ...prev, files: { ...prev.files, [field]: file } }));
  const role = data.role_type;
  const isLevelled = role === "ASSISTANT" || role === "TECHNICIAN";
  const badge = (code: string) => badges.find(row => row.code === code);

  const save = async () => {
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      const form = new FormData();
      form.append("tab", "regulatory");
      // Submitting runs the document checks; only an intern's AHPRA number is required.
      form.append("submitted_for_verification", "true");
      if (role) form.append("role_type", role);
      if (isLevelled) {
        form.append("classification_level", data.classification_level);
        form.append("dispensary_qualification", data.dispensary_qualification);
      }
      if (role === "STUDENT") form.append("student_year", data.student_year);
      if (role === "INTERN") form.append("ahpra_number", data.ahpra_number.trim());
      (Object.entries(data.files) as [FileField, File | null][]).forEach(([field, file]) => { if (file) form.append(field, file); });
      const response = await updateOnboardingForm(roleKey, form);
      announceOnboardingSaved(response);
      accept(response || {});
      setSaved(true);
    } catch (err: any) {
      const body = err.response?.data;
      if (body && typeof body === "object" && !body.detail) {
        setFieldErrors(Object.fromEntries(Object.entries(body).map(([field, messages]) => [field, ([] as string[]).concat(messages as any).join(" ")])));
        setError("Check the highlighted field.");
      } else {
        setError(body?.detail || "We couldn't save your role details. Your changes are still here; try again.");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Stack spacing={1.5} aria-busy="true">{[0, 1, 2].map(i => <Box key={i} sx={{ height: 56, borderRadius: "12px", bgcolor: "var(--ct-subtle-bg)" }} />)}</Stack>;
  }

  return (
    <Stack spacing={3}>
      {error && <Alert severity="error">{error}</Alert>}

      <Stack component="section" spacing={2} aria-labelledby="role-heading">
        <Typography id="role-heading" component="h3" sx={{ fontSize: 16, fontWeight: 600, color: "var(--ct-text-primary)" }}>Your role</Typography>
        <TextField select fullWidth required label="Role" value={role} error={Boolean(fieldErrors.role_type)} helperText={fieldErrors.role_type}
          onChange={event => set({ role_type: event.target.value as Role, classification_level: "", dispensary_qualification: "", student_year: "" })}>
          {ROLE_CHOICES.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
        </TextField>

        {isLevelled && (
          <>
            <TextField select fullWidth required label="Award classification" value={data.classification_level}
              onChange={event => set({ classification_level: event.target.value })} error={Boolean(fieldErrors.classification_level)}
              helperText={fieldErrors.classification_level || otherStaffQualificationLevels.find(level => level.value === data.classification_level)?.explainer || "The level you are paid at under the Pharmacy Industry Award."}>
              {otherStaffQualificationLevels.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
            </TextField>
            <TextField select fullWidth label="Dispensing training (optional)" value={data.dispensary_qualification}
              onChange={event => set({ dispensary_qualification: event.target.value })}
              helperText={dispensaryQualifications.find(item => item.value === data.dispensary_qualification)?.explainer || "Claim it if you have it. Pharmacies see it as Not verified until we check your certificate."}>
              <MenuItem value="">None</MenuItem>
              {dispensaryQualifications.map(item => <MenuItem key={item.value} value={item.value}>{item.label}</MenuItem>)}
            </TextField>
          </>
        )}

        {role === "STUDENT" && (
          <TextField select fullWidth required label="Year of study" value={data.student_year} onChange={event => set({ student_year: event.target.value })}
            error={Boolean(fieldErrors.student_year)} helperText={fieldErrors.student_year}>
            {STUDENT_YEAR_CHOICES.map(option => <MenuItem key={option.value} value={option.value}>{option.label}</MenuItem>)}
          </TextField>
        )}

        {role === "INTERN" && (
          <Stack spacing={1}>
            <TextField fullWidth required label="AHPRA number" value={data.ahpra_number} onChange={event => set({ ahpra_number: event.target.value })} disabled={data.ahpra_verified}
              inputProps={{ autoComplete: "off", spellCheck: false }} error={Boolean(fieldErrors.ahpra_number)}
              helperText={fieldErrors.ahpra_number || (data.ahpra_verified
                ? "Checked by our team. Your AHPRA number stays with you for life, through to general registration; contact support to correct it."
                : "Your provisional (intern) registration. Our team checks it on the AHPRA register; nothing else is needed from interns.")} />
            {badge("AHPRA_PROVISIONAL") && data.ahpra_number && (
              <Box><EvidencePill code="AHPRA_PROVISIONAL" label="AHPRA provisional registration" state={badge("AHPRA_PROVISIONAL")!.state} explainer={badge("AHPRA_PROVISIONAL")!.explainer} /></Box>
            )}
          </Stack>
        )}
      </Stack>

      {role && role !== "INTERN" && (
        <Stack component="section" spacing={1.5} aria-labelledby="evidence-heading">
          <Box>
            <Typography id="evidence-heading" component="h3" sx={{ fontSize: 16, fontWeight: 600, color: "var(--ct-text-primary)" }}>Evidence (optional)</Typography>
            <Typography sx={{ fontSize: 13.5, color: "var(--ct-text-secondary)", mt: 0.25 }}>You can apply without these. Each one earns a badge pharmacies see once we have checked it.</Typography>
          </Box>
          {isLevelled && (
            <EvidenceRow form={data} onPick={pick} field="certificate" badge={badge("QUALIFICATION")}
              title="Qualification certificate"
              purpose="Certificate II, III or IV (with the unit transcript for dispensing). Earns the Qualification badge, and the Dispensing badge once our team confirms SIRCDIS003." />
          )}
          {role === "STUDENT" && (
            <EvidenceRow form={data} onPick={pick} field="university_id" badge={badge("ENROLMENT")}
              title="University ID" purpose="Your current student card. Earns the University enrolment badge." />
          )}
          <EvidenceRow form={data} onPick={pick} field="cpr_certificate" title="First aid / CPR certificate" purpose="Kept on your profile for pharmacies that ask." />
          <EvidenceRow form={data} onPick={pick} field="s8_certificate" title="S8 certificate" purpose="Kept on your profile for pharmacies that ask." />
        </Stack>
      )}

      <Box>
        <Button variant="contained" onClick={save} disabled={saving || !role} startIcon={saving ? <CircularProgress size={16} color="inherit" /> : undefined}>
          {saving ? "Saving…" : "Save role & qualifications"}
        </Button>
        {!role && <Typography sx={{ fontSize: 13, color: "var(--ct-text-secondary)", mt: 1 }}>Choose your role to continue.</Typography>}
      </Box>

      <Snackbar open={saved} autoHideDuration={2500} onClose={() => setSaved(false)}>
        <Alert severity="success" sx={{ width: "100%" }}>Role and qualifications saved.</Alert>
      </Snackbar>
    </Stack>
  );
}
