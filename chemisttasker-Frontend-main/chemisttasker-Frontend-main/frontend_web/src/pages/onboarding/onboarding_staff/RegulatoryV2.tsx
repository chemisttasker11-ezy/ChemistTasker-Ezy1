// frontend_web/src/pages/onboarding_staff/RegulatoryV2.tsx
import React, { useEffect, useState } from "react";
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Button,
  Link,
  Alert,
  Snackbar,
  Stack,
  Divider,
} from "@mui/material";
import { API_BASE_URL } from "../../../constants/api";
import { getOnboardingDetail, updateOnboardingForm } from "@chemisttasker/shared-core";
import { useUnsavedChangesGuard } from "../../../hooks/useUnsavedChangesGuard";

/**
 * Mirrors legacy dependent selects and docs:
 * - INTERN    -> intern_half + (ahpra_proof, hours_proof)
 * - TECHNICIAN/ASSISTANT -> classification_level (for assistant only) + certificate
 * - STUDENT   -> student_year + university_id
 * (cpr_certificate / s8_certificate exist but are not required for a specific role in V2)
 *
 * Server expects: tab="regulatory" and file fields named as in the model:
 *   role_type, classification_level, student_year, intern_half,
 *   ahpra_proof, hours_proof, certificate, university_id, cpr_certificate, s8_certificate
 */

type Role =
  | "INTERN"
  | "TECHNICIAN"
  | "ASSISTANT"
  | "STUDENT"
  | "";

type FormDataShape = {
  role_type: Role;
  classification_level?: string | null;
  student_year?: string | null;
  intern_half?: string | null;

  ahpra_proof: File | null;
  hours_proof: File | null;
  certificate: File | null;
  university_id: File | null;
  cpr_certificate: File | null;
  s8_certificate: File | null;

  // existing urls to show "View" links
  _existing: {
    ahpra_proof?: string;
    hours_proof?: string;
    certificate?: string;
    university_id?: string;
    cpr_certificate?: string;
    s8_certificate?: string;
  };
};

const ROLE_CHOICES = [
  { value: "INTERN", label: "Intern Pharmacist" },
  { value: "TECHNICIAN", label: "Dispensary Technician" },
  { value: "ASSISTANT", label: "Pharmacy Assistant" },
  { value: "STUDENT", label: "Pharmacy Student" },
];

const ASSISTANT_LEVEL_CHOICES = [
  { value: "LEVEL_1", label: "Pharmacy Assistant - Level 1" },
  { value: "LEVEL_2", label: "Pharmacy Assistant - Level 2" },
  { value: "LEVEL_3", label: "Pharmacy Assistant - Level 3" },
  { value: "LEVEL_4", label: "Pharmacy Assistant - Level 4" },
];

const STUDENT_YEAR_CHOICES = [
  { value: "YEAR_1", label: "Pharmacy Student - 1st Year" },
  { value: "YEAR_2", label: "Pharmacy Student - 2nd Year" },
  { value: "YEAR_3", label: "Pharmacy Student - 3rd Year" },
  { value: "YEAR_4", label: "Pharmacy Student - 4th Year" },
];

const INTERN_HALF_CHOICES = [
  { value: "FIRST_HALF", label: "Intern - First Half" },
  { value: "SECOND_HALF", label: "Intern - Second Half" },
];

function fileUrl(path?: string) {
  if (!path) return "";
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

export default function RegulatoryV2() {
  const roleKey = "otherstaff";
  const [loading, setLoading] = useState(false);
  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [error, setError] = useState<string>("");

  const [data, setData] = useState<FormDataShape>({
    role_type: "",
    classification_level: "",
    student_year: "",
    intern_half: "",
    ahpra_proof: null,
    hours_proof: null,
    certificate: null,
    university_id: null,
    cpr_certificate: null,
    s8_certificate: null,
    _existing: {},
  });
  const unsaved = useUnsavedChangesGuard({
    disabled: loading,
    value: data,
  });

  // hydrate form with current server values (and existing file URLs)
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await getOnboardingDetail(roleKey);
        if (!isMounted) return;
        const d: any = res || {};
        const nextData = {
          role_type: (d.role_type as Role) || "",
          classification_level: d.classification_level || "",
          student_year: d.student_year || "",
          intern_half: d.intern_half || "",
          ahpra_proof: null,
          hours_proof: null,
          certificate: null,
          university_id: null,
          cpr_certificate: null,
          s8_certificate: null,
          _existing: {
            ahpra_proof: d.ahpra_proof || "",
            hours_proof: d.hours_proof || "",
            certificate: d.certificate || "",
            university_id: d.university_id || "",
            cpr_certificate: d.cpr_certificate || "",
            s8_certificate: d.s8_certificate || "",
          },
        };
        setData(nextData);
        unsaved.markClean(nextData);
      } catch (err: any) {
        if (err.response?.status !== 404) {
          setError(err.response?.data?.detail || err.message);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [roleKey]);

  // clear sub-role fields on role change
  const onRoleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value as Role;
    setData((prev) => ({
      ...prev,
      role_type: value,
      classification_level: "",
      student_year: "",
      intern_half: "",
    }));
  };

  const onTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setData((prev) => ({ ...prev, [name]: value }));
  };

  const onFileChange =
    (field: keyof FormDataShape) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0] ?? null;
      setData((prev) => ({ ...prev, [field]: file }));
    };

  const showAssistantLevel = data.role_type === "ASSISTANT";
  const showStudentYear = data.role_type === "STUDENT";
  const showInternHalf = data.role_type === "INTERN";

  const handleSave = async (submitForVerification = false) => {
    setLoading(true);
    setError("");
    try {
      const form = new FormData();

      // tab router
      form.append("tab", "regulatory");
      if (submitForVerification) {
        form.append("submitted_for_verification", "true");
      }

      // role + sub-roles
      if (data.role_type) form.append("role_type", data.role_type);
      if (showAssistantLevel) form.append("classification_level", data.classification_level || "");
      if (showStudentYear) form.append("student_year", data.student_year || "");
      if (showInternHalf) form.append("intern_half", data.intern_half || "");

      // files (append only if present; replacement semantics)
      if (data.ahpra_proof) form.append("ahpra_proof", data.ahpra_proof);
      if (data.hours_proof) form.append("hours_proof", data.hours_proof);
      if (data.certificate) form.append("certificate", data.certificate);
      if (data.university_id) form.append("university_id", data.university_id);
      if (data.cpr_certificate) form.append("cpr_certificate", data.cpr_certificate);
      if (data.s8_certificate) form.append("s8_certificate", data.s8_certificate);

      // PATCH (V2 is single detail endpoint)
      const res = await updateOnboardingForm(roleKey, form);

      // keep any new file urls returned
      const d: any = res || {};
      const nextData = {
        ...data,
        ahpra_proof: null,
        hours_proof: null,
        certificate: null,
        university_id: null,
        cpr_certificate: null,
        s8_certificate: null,
        _existing: {
          ahpra_proof: d.ahpra_proof || data._existing.ahpra_proof,
          hours_proof: d.hours_proof || data._existing.hours_proof,
          certificate: d.certificate || data._existing.certificate,
          university_id: d.university_id || data._existing.university_id,
          cpr_certificate: d.cpr_certificate || data._existing.cpr_certificate,
          s8_certificate: d.s8_certificate || data._existing.s8_certificate,
        },
      };
      setData(nextData);
      unsaved.markClean(nextData);
      setSnackbarOpen(true);
    } catch (err: any) {
      const resp = err.response?.data;
      if (resp && typeof resp === "object") {
        // show flattened server validation errors (e.g. required per role)
        setError(
          Object.entries(resp)
            .map(([f, msgs]) => `${f}: ${(msgs as string[]).join(",")}`)
            .join("\n")
        );
      } else setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ p: 2 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 2, whiteSpace: "pre-wrap" }}>
          {error}
        </Alert>
      )}
      <Snackbar
        open={snackbarOpen}
        autoHideDuration={2500}
        onClose={() => setSnackbarOpen(false)}
      >
        <Alert severity="success" sx={{ width: "100%" }}>
          Regulatory details saved.
        </Alert>
      </Snackbar>

      <Typography variant="h6" gutterBottom>
        Regulatory Documents
      </Typography>

      <Stack spacing={2}>
        {/* ROLE */}
        <TextField
          select
          fullWidth
          label="Role"
          name="role_type"
          value={data.role_type}
          onChange={onRoleChange}
          required
        >
          {ROLE_CHOICES.map((opt) => (
            <MenuItem key={opt.value} value={opt.value}>
              {opt.label}
            </MenuItem>
          ))}
        </TextField>

        {/* DEPENDENT SUB-ROLES */}
        {showAssistantLevel && (
          <TextField
            select
            fullWidth
            label="Assistant Classification Level"
            name="classification_level"
            value={data.classification_level || ""}
            onChange={onTextChange}
            required
          >
            {ASSISTANT_LEVEL_CHOICES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        )}

        {showStudentYear && (
          <TextField
            select
            fullWidth
            label="Student Year"
            name="student_year"
            value={data.student_year || ""}
            onChange={onTextChange}
            required
          >
            {STUDENT_YEAR_CHOICES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        )}

        {showInternHalf && (
          <TextField
            select
            fullWidth
            label="Intern Half"
            name="intern_half"
            value={data.intern_half || ""}
            onChange={onTextChange}
            required
          >
            {INTERN_HALF_CHOICES.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </TextField>
        )}

        <Divider />

        {/* ROLE-SPECIFIC FILES */}
        {data.role_type === "INTERN" && (
          <Stack spacing={1}>
            <Typography fontWeight={600}>Intern Documents</Typography>

            <Stack direction="row" alignItems="center" spacing={1}>
              <Button variant="outlined" component="label">
                Upload AHPRA Proof
                <input hidden type="file" onChange={onFileChange("ahpra_proof")} />
              </Button>
              {data._existing.ahpra_proof && (
                <Link
                  href={fileUrl(data._existing.ahpra_proof)}
                  target="_blank"
                  sx={{ fontSize: "0.875rem" }}
                >
                  View current
                </Link>
              )}
            </Stack>

            <Stack direction="row" alignItems="center" spacing={1}>
              <Button variant="outlined" component="label">
                Upload Hours Proof
                <input hidden type="file" onChange={onFileChange("hours_proof")} />
              </Button>
              {data._existing.hours_proof && (
                <Link
                  href={fileUrl(data._existing.hours_proof)}
                  target="_blank"
                  sx={{ fontSize: "0.875rem" }}
                >
                  View current
                </Link>
              )}
            </Stack>
          </Stack>
        )}

        {(data.role_type === "TECHNICIAN" || data.role_type === "ASSISTANT") && (
          <Stack spacing={1}>
            <Typography fontWeight={600}>
              {data.role_type === "TECHNICIAN" ? "Technician" : "Assistant"} Documents
            </Typography>

            <Stack direction="row" alignItems="center" spacing={1}>
              <Button variant="outlined" component="label">
                Upload Certificate
                <input hidden type="file" onChange={onFileChange("certificate")} />
              </Button>
              {data._existing.certificate && (
                <Link
                  href={fileUrl(data._existing.certificate)}
                  target="_blank"
                  sx={{ fontSize: "0.875rem" }}
                >
                  View current
                </Link>
              )}
            </Stack>
          </Stack>
        )}

        {data.role_type === "STUDENT" && (
          <Stack spacing={1}>
            <Typography fontWeight={600}>Student Documents</Typography>

            <Stack direction="row" alignItems="center" spacing={1}>
              <Button variant="outlined" component="label">
                Upload University ID
                <input hidden type="file" onChange={onFileChange("university_id")} />
              </Button>
              {data._existing.university_id && (
                <Link
                  href={fileUrl(data._existing.university_id)}
                  target="_blank"
                  sx={{ fontSize: "0.875rem" }}
                >
                  View current
                </Link>
              )}
            </Stack>
          </Stack>
        )}

        {/* Optional docs that exist on the model but not required by a role */}
        <Divider />
        <Typography fontWeight={600}>Optional Documents</Typography>

        <Stack direction="row" alignItems="center" spacing={1}>
          <Button variant="outlined" component="label">
            Upload CPR Certificate
            <input hidden type="file" onChange={onFileChange("cpr_certificate")} />
          </Button>
          {data._existing.cpr_certificate && (
            <Link
              href={fileUrl(data._existing.cpr_certificate)}
              target="_blank"
              sx={{ fontSize: "0.875rem" }}
            >
              View current
            </Link>
          )}
        </Stack>

        <Stack direction="row" alignItems="center" spacing={1}>
          <Button variant="outlined" component="label">
            Upload S8 Certificate
            <input hidden type="file" onChange={onFileChange("s8_certificate")} />
          </Button>
          {data._existing.s8_certificate && (
            <Link
              href={fileUrl(data._existing.s8_certificate)}
              target="_blank"
              sx={{ fontSize: "0.875rem" }}
            >
              View current
            </Link>
          )}
        </Stack>

        {/* Actions */}
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button
            variant="outlined"
            disabled={loading}
            onClick={() => handleSave(false)}
          >
            {loading ? "Saving…" : "Save"}
          </Button>
          <Button
            variant="contained"
            disabled={loading}
            onClick={() => handleSave(true)}
          >
            {loading ? "Submitting…" : "Submit this tab"}
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
