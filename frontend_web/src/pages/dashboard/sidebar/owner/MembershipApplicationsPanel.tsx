import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import DoneIcon from "@mui/icons-material/Done";
import CloseIcon from "@mui/icons-material/Close";
import {
  approveMembershipApplicationService,
  fetchMembershipApplicationsService,
  rejectMembershipApplicationService,
  type MembershipApplication,
  type MembershipDTO,
} from "@chemisttasker/shared-core";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

const getFirstErrorMessage = (value: unknown): string | null => {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : null;
  }
  return null;
};

type MembershipApplicationsPanelProps = {
  pharmacyId: string;
  category: "FULL_PART_TIME" | "LOCUM_CASUAL";
  title: string;
  allowedEmploymentTypes: string[];
  defaultEmploymentType: string;
  onApproved?: () => void;
  onNotification?: (message: string, severity: "success" | "error") => void;
};

const labelEmploymentType = (value?: string) =>
  (value || "")
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");

const labelCategory = (category: "FULL_PART_TIME" | "LOCUM_CASUAL") =>
  category === "FULL_PART_TIME" ? "Full/Part-time" : "Favourite (Locum/Shift Hero)";

const formatClassification = (app: MembershipApplication) => {
  const raw =
    app.pharmacistAwardLevel ||
    app.otherstaffClassificationLevel ||
    app.internHalf ||
    app.studentYear ||
    "";

  return raw
    .toLowerCase()
    .split("_")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
    .join(" ");
};

const formatTimestamp = (value?: string | null) => {
  if (!value) return "-";
  const parsed = dayjs.utc(value);
  return parsed.isValid() ? parsed.local().toDate().toLocaleString() : value;
};

const readValue = (app: MembershipApplication, camelKey: string, snakeKey: string) =>
  (app as any)?.[camelKey] ?? (app as any)?.[snakeKey] ?? "";

const readMembershipValue = (membership: MembershipDTO, camelKey: string, snakeKey: string) =>
  (membership as any)?.[camelKey] ?? (membership as any)?.[snakeKey] ?? "";

const formatMembershipName = (membership: MembershipDTO) => {
  const userDetails = (membership as any).userDetails ?? (membership as any).user_details ?? {};
  return (
    readMembershipValue(membership, "invitedName", "invited_name") ||
    (membership as any).name ||
    [userDetails.firstName ?? userDetails.first_name, userDetails.lastName ?? userDetails.last_name].filter(Boolean).join(" ") ||
    "Invited worker"
  );
};

const formatMembershipEmail = (membership: MembershipDTO) => {
  const userDetails = (membership as any).userDetails ?? (membership as any).user_details ?? {};
  return userDetails.email || (membership as any).email || "";
};

export function PendingDirectInvitationsPanel({
  memberships,
  title,
}: {
  memberships: MembershipDTO[];
  title: string;
}) {
  const pendingMemberships = memberships.filter((membership) => {
    const status = String((membership as any).status || "").toUpperCase();
    const active = ((membership as any).is_active ?? (membership as any).isActive) !== false;
    return status === "PENDING" || (!status && !active);
  });

  if (pendingMemberships.length === 0) {
    return null;
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>
      <Stack spacing={1.5}>
        {pendingMemberships.map((membership) => {
          const name = formatMembershipName(membership);
          const email = formatMembershipEmail(membership);
          const role = String((membership as any).role || "");
          const workType = String(readMembershipValue(membership, "employmentType", "employment_type") || "");
          const jobTitle = readMembershipValue(membership, "jobTitle", "job_title");
          return (
            <Card key={membership.id} variant="outlined">
              <CardContent>
                <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} justifyContent="space-between">
                  <Box sx={{ minWidth: 0 }}>
                    <Typography fontWeight={700}>{name}</Typography>
                    {email ? (
                      <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: "anywhere" }}>
                        {email}
                      </Typography>
                    ) : null}
                    <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                      {role ? <Chip size="small" label={role.replace(/_/g, " ")} /> : null}
                      {workType ? <Chip size="small" label={labelEmploymentType(workType)} color="warning" variant="outlined" /> : null}
                      {jobTitle ? <Chip size="small" label={jobTitle} variant="outlined" /> : null}
                    </Stack>
                  </Box>
                  <Chip label="Waiting for worker response" color="warning" sx={{ alignSelf: { xs: "flex-start", md: "center" }, fontWeight: 800 }} />
                </Stack>
              </CardContent>
            </Card>
          );
        })}
      </Stack>
    </Box>
  );
}

export default function MembershipApplicationsPanel({
  pharmacyId,
  category,
  title,
  allowedEmploymentTypes,
  defaultEmploymentType,
  onApproved,
  onNotification,
}: MembershipApplicationsPanelProps) {
  const [applications, setApplications] = useState<MembershipApplication[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [approveTypeById, setApproveTypeById] = useState<Record<number, string>>({});
  const isFetchingRef = useRef(false);

  const notify = useCallback(
    (message: string, severity: "success" | "error") => {
      onNotification?.(message, severity);
    },
    [onNotification]
  );

  const fetchApplications = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    setLoading(true);
    try {
      const results = await fetchMembershipApplicationsService({ status: "PENDING" });
      const filtered = results.filter(
        (app: MembershipApplication) =>
          String(app.pharmacy) === String(pharmacyId) && app.category === category
      );
      setApplications(filtered);
      setApproveTypeById((prev) => {
        const base = { ...prev };
        filtered.forEach((app: MembershipApplication) => {
          if (!base[app.id]) {
            base[app.id] = defaultEmploymentType;
          }
        });
        return base;
      });
    } catch (error: any) {
      console.error(error);
      notify(error?.response?.data?.detail || "Failed to load membership applications.", "error");
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [category, defaultEmploymentType, notify, pharmacyId]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const allowedTypes = useMemo(() => {
    if (!allowedEmploymentTypes?.length) {
      return [defaultEmploymentType];
    }
    return Array.from(new Set([...allowedEmploymentTypes, defaultEmploymentType]));
  }, [allowedEmploymentTypes, defaultEmploymentType]);

  const handleApprove = useCallback(
    async (app: MembershipApplication) => {
      const employmentType = approveTypeById[app.id] || defaultEmploymentType;
      try {
        await approveMembershipApplicationService(app.id, { employment_type: employmentType });
        notify("Application approved.", "success");
        await fetchApplications();
        onApproved?.();
      } catch (error: any) {
        const data = error?.response?.data;
        const firstFieldError =
          data && typeof data === "object"
            ? Object.values(data as Record<string, unknown>)
                .map(getFirstErrorMessage)
                .find((value): value is string => Boolean(value))
            : null;
        notify(data?.detail || firstFieldError || "Failed to approve application.", "error");
      }
    },
    [approveTypeById, defaultEmploymentType, fetchApplications, notify, onApproved]
  );

  const handleReject = useCallback(
    async (app: MembershipApplication) => {
      try {
        await rejectMembershipApplicationService(app.id);
        notify("Application rejected.", "success");
        await fetchApplications();
      } catch (error: any) {
        const data = error?.response?.data;
        notify(data?.detail || "Failed to reject application.", "error");
      }
    },
    [fetchApplications, notify]
  );

  return (
    <Box sx={{ mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 1 }}>
        {title}
      </Typography>

      {loading ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <CircularProgress size={20} />
          <Typography variant="body2" color="text.secondary">
            Loading applications...
          </Typography>
        </Stack>
      ) : applications.length === 0 ? null : (
        <Stack spacing={1.5}>
          {applications.map((app) => {
            const applicantName = [app.firstName, app.lastName].filter(Boolean).join(" ") || "Applicant";
            const selectedType = approveTypeById[app.id] || defaultEmploymentType;
            const classification = formatClassification(app);
            const jobTitle = readValue(app, "jobTitle", "job_title");
            const mobileNumber = readValue(app, "mobileNumber", "mobile_number");

            return (
              <Card key={app.id} variant="outlined">
                <CardContent
                  sx={{
                    display: "flex",
                    flexDirection: { xs: "column", md: "row" },
                    gap: 2,
                    alignItems: { xs: "flex-start", md: "center" },
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography fontWeight={600}>{applicantName}</Typography>
                    {app.email && (
                      <Typography variant="body2" color="text.secondary">
                        {app.email}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1} flexWrap="wrap" mt={1}>
                      <Chip size="small" label={app.role} />
                      <Chip size="small" label={labelCategory(app.category)} color="primary" variant="outlined" />
                      {classification && (
                        <Chip size="small" label={classification} variant="outlined" />
                      )}
                    </Stack>
                    <Typography variant="caption" sx={{ display: "block", mt: 1, color: "text.secondary" }}>
                      Submitted: {formatTimestamp(app.submittedAt)}
                    </Typography>
                    <Box
                      sx={{
                        mt: 1.25,
                        px: 1.25,
                        py: 1,
                        borderRadius: 2,
                        bgcolor: "rgba(6, 18, 58, 0.04)",
                      }}
                    >
                      <Typography variant="caption" sx={{ display: "block", fontWeight: 800, color: "text.secondary" }}>
                        Candidate Summary
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        Role requested: {app.role}
                      </Typography>
                      {jobTitle ? (
                        <Typography variant="body2">
                          Job title: {jobTitle}
                        </Typography>
                      ) : null}
                      {mobileNumber ? (
                        <Typography variant="body2">
                          Mobile: {mobileNumber}
                        </Typography>
                      ) : null}
                      {classification ? (
                        <Typography variant="body2">
                          Classification: {classification}
                        </Typography>
                      ) : null}
                    </Box>
                  </Box>

                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1}
                    alignItems={{ xs: "stretch", sm: "center" }}
                  >
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                      <InputLabel id={`employment-type-${app.id}`}>Approve as</InputLabel>
                      <Select
                        labelId={`employment-type-${app.id}`}
                        label="Approve as"
                        value={selectedType}
                        onChange={(event) =>
                          setApproveTypeById((prev) => ({
                            ...prev,
                            [app.id]: String(event.target.value),
                          }))
                        }
                      >
                        {allowedTypes.map((type) => (
                          <MenuItem key={type} value={type}>
                            {labelEmploymentType(type)}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>

                    <Stack direction="row" spacing={0.5}>
                      <Tooltip title="Approve">
                        <span>
                          <IconButton color="success" onClick={() => handleApprove(app)}>
                            <DoneIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="Reject">
                        <span>
                          <IconButton color="error" onClick={() => handleReject(app)}>
                            <CloseIcon />
                          </IconButton>
                        </span>
                      </Tooltip>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            );
          })}
        </Stack>
      )}
    </Box>
  );
}
