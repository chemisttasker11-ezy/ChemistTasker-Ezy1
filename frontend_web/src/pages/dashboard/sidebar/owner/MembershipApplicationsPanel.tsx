import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Stack } from "@mui/material";
import { Clock3, MailCheck } from "lucide-react";
import { Pill, type ShiftTone } from "../../shiftCenter/ShiftCentreParts";
import {
  ConfirmDialog,
  MemberRow,
  TeamList,
  TeamListSkeleton,
  TeamSection,
  actionButtonSx,
  employmentLabel,
  formatDate,
  membershipEmail,
  membershipName,
  membershipPhoto,
  prettyCode,
  roleLabel,
  roleTone,
} from "./teamUi";
import {
  fetchMembershipApplicationsService,
  rejectMembershipApplicationService,
  type MembershipApplication,
  type MembershipDTO,
} from "@chemisttasker/shared-core";
import MembershipApplicationReviewDialog from "./MembershipApplicationReviewDialog";


type MembershipApplicationsPanelProps = {
  pharmacyId: string;
  category: "FULL_PART_TIME" | "LOCUM_CASUAL";
  title: string;
  allowedEmploymentTypes: string[];
  defaultEmploymentType: string;
  onApproved?: () => void;
  onNotification?: (message: string, severity: "success" | "error") => void;
  /** Reports how many applications are waiting, so the page can surface them. */
  onCountChange?: (count: number) => void;
};

const deriveLocumEmploymentType = (role?: string) =>
  String(role || "").toUpperCase() === "PHARMACIST" ? "LOCUM" : "SHIFT_HERO";

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

const paymentProfile = (app: MembershipApplication) =>
  ((app as any).paymentProfileStatus ?? (app as any).payment_profile_status ?? null) as null | {
    accountLinked?: boolean;
    onboardingComplete?: boolean;
    paymentPreference?: string | null;
    status?: string;
    payrollReady?: boolean;
    invoiceReady?: boolean;
    missingFields?: string[];
  };

const paymentProfileLabel = (status: ReturnType<typeof paymentProfile>) => {
  if (!status) return 'Payment profile unavailable';
  if (status.paymentPreference === 'TFN') {
    return status.payrollReady ? 'TFN · payroll ready' : 'TFN · payroll setup incomplete';
  }
  if (status.paymentPreference === 'ABN') {
    return status.invoiceReady ? 'ABN · invoice ready' : 'ABN · invoice setup incomplete';
  }
  if (status.status === 'ACCOUNT_NOT_LINKED') return 'Worker account not linked';
  if (status.status === 'ONBOARDING_INCOMPLETE') return 'Worker onboarding incomplete';
  return 'Payment preference required';
};

const paymentProfileTone = (status: ReturnType<typeof paymentProfile>): ShiftTone =>
  (status?.paymentPreference === 'TFN' && status?.payrollReady) || (status?.paymentPreference === 'ABN' && status?.invoiceReady) ? 'green' : 'amber';

const readValue = (app: MembershipApplication, camelKey: string, snakeKey: string) =>
  (app as any)?.[camelKey] ?? (app as any)?.[snakeKey] ?? "";

const readMembershipValue = (membership: MembershipDTO, camelKey: string, snakeKey: string) =>
  (membership as any)?.[camelKey] ?? (membership as any)?.[snakeKey] ?? "";

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
    <Box sx={{ mt: 4 }}>
      <TeamSection title={title} count={pendingMemberships.length} tone="amber" description="Waiting for the person to accept. They join the list above once they do.">
        <TeamList label={title}>
          {pendingMemberships.map((membership) => {
            const name = membershipName(membership, "Invited person");
            const role = String((membership as any).role || "");
            const workType = String(readMembershipValue(membership, "employmentType", "employment_type") || "");
            const jobTitle = readMembershipValue(membership, "jobTitle", "job_title");
            const email = membershipEmail(membership);
            const sent = formatDate(readMembershipValue(membership, "createdAt", "created_at"));
            return (
              <MemberRow
                key={membership.id}
                name={name}
                photoUrl={membershipPhoto(membership)}
                role={roleLabel(role) || "Invited"}
                tone={roleTone(role)}
                trailing={<Pill label="Waiting for reply" tone="amber" icon={<Clock3 size={13} />} />}
                details={[
                  { label: "Employment", value: employmentLabel(workType) },
                  { label: "Job title", value: jobTitle },
                  { label: "Invited on", value: sent },
                  { label: "Sent to", value: email },
                ]}
              />
            );
          })}
        </TeamList>
      </TeamSection>
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
  onCountChange,
}: MembershipApplicationsPanelProps) {
  const [applications, setApplications] = useState<MembershipApplication[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [reviewing, setReviewing] = useState<MembershipApplication | null>(null);
  const [declining, setDeclining] = useState<MembershipApplication | null>(null);
  const [declineBusy, setDeclineBusy] = useState(false);

  useEffect(() => {
    onCountChange?.(applications.length);
  }, [applications.length, onCountChange]);
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
    } catch (error: any) {
      console.error("Membership application load failed", error);
      const apiDetail = error?.response?.data?.detail;
      notify(
        apiDetail || (error instanceof Error ? error.message : "Failed to load membership applications."),
        "error"
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [category, notify, pharmacyId]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    const handleNotification = (event: Event) => {
      const notification = (event as CustomEvent).detail || {};
      const payload = notification.payload || {};
      const applicationId = payload.application_id ?? payload.applicationId;
      const notificationPharmacyId = payload.pharmacy_id ?? payload.pharmacyId;
      const notificationCategory = payload.category;
      if (!applicationId) return;
      if (notificationPharmacyId != null && String(notificationPharmacyId) !== String(pharmacyId)) return;
      if (notificationCategory && notificationCategory !== category) return;
      void fetchApplications();
    };

    window.addEventListener("chemisttasker-notification-created", handleNotification);
    return () => window.removeEventListener("chemisttasker-notification-created", handleNotification);
  }, [category, fetchApplications, pharmacyId]);

  const allowedTypes = useMemo(() => {
    if (!allowedEmploymentTypes?.length) {
      return [defaultEmploymentType];
    }
    return Array.from(new Set([...allowedEmploymentTypes, defaultEmploymentType]));
  }, [allowedEmploymentTypes, defaultEmploymentType]);

  const handleReject = useCallback(
    async (app: MembershipApplication) => {
      setDeclineBusy(true);
      try {
        await rejectMembershipApplicationService(app.id);
        notify("Application declined.", "success");
        await fetchApplications();
      } catch (error: any) {
        const data = error?.response?.data;
        notify(data?.detail || "The application wasn't declined. Try again.", "error");
      } finally {
        setDeclineBusy(false);
        setDeclining(null);
      }
    },
    [fetchApplications, notify]
  );

  if (!loading && applications.length === 0) {
    return (
      <MembershipApplicationReviewDialog
        open={Boolean(reviewing)}
        application={reviewing}
        defaultEmploymentType={reviewing?.category === "LOCUM_CASUAL" ? deriveLocumEmploymentType(reviewing?.role) : defaultEmploymentType}
        allowedEmploymentTypes={allowedTypes}
        onClose={() => setReviewing(null)}
        onUpdated={(updated) => setReviewing(updated)}
        onApproved={async () => {
          setReviewing(null);
          await fetchApplications();
          onApproved?.();
        }}
        onNotification={notify}
      />
    );
  }

  return (
    <Box sx={{ mb: 4 }}>
      <TeamSection
        title={title}
        count={loading ? undefined : applications.length}
        tone="magenta"
        description="People who asked to join through your invite link. Review to set their role and approve."
      >
      {loading && applications.length === 0 ? (
        <TeamListSkeleton rows={1} label="Loading applications" />
      ) : (
        <TeamList label={title}>
          {applications.map((app) => {
            const applicantName = [app.firstName, app.lastName].filter(Boolean).join(" ") || "Applicant";
            const classification = formatClassification(app);
            const jobTitle = readValue(app, "jobTitle", "job_title");
            const username = readValue(app, "username", "username");
            const mobileNumber = readValue(app, "mobileNumber", "mobile_number");
            const dateOfBirth = readValue(app, "dateOfBirth", "date_of_birth");
            const profile = paymentProfile(app);
            const payrollEnabled = Boolean((app as any).payrollEnabled ?? (app as any).payroll_enabled);
            const submitted = formatDate(app.submittedAt);

            return (
              <MemberRow
                key={app.id}
                name={applicantName}
                role={`${roleLabel(app.role)}${submitted ? ` · applied ${submitted}` : ""}`}
                tone={roleTone(app.role)}
                trailing={
                  <Button variant="contained" size="small" onClick={() => setReviewing(app)} sx={{ ...actionButtonSx, minHeight: 36 }}>
                    Review
                  </Button>
                }
                note={
                  <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap>
                    <Pill label={paymentProfileLabel(profile)} tone={paymentProfileTone(profile)} />
                    {app.category === 'FULL_PART_TIME' ? (
                      <Pill label={payrollEnabled ? 'ChemistTasker Payroll on' : 'External payroll'} tone={payrollEnabled ? 'violet' : 'neutral'} />
                    ) : null}
                  </Stack>
                }
                details={[
                  { label: "Role requested", value: roleLabel(app.role) },
                  { label: "Classification", value: classification },
                  { label: "Job title", value: jobTitle },
                  { label: "Mobile", value: mobileNumber },
                  { label: "Date of birth", value: dateOfBirth },
                  { label: "Username", value: username },
                  { label: "Email", value: app.email },
                  {
                    label: "Payment setup still needed",
                    value: profile?.missingFields?.length ? profile.missingFields.map((field) => prettyCode(field)).join(', ') : "",
                  },
                ]}
                actions={
                  <>
                    <Button variant="contained" startIcon={<MailCheck size={16} />} onClick={() => setReviewing(app)} sx={actionButtonSx}>
                      Review and approve
                    </Button>
                    <Button color="error" onClick={() => setDeclining(app)} sx={actionButtonSx}>
                      Decline
                    </Button>
                  </>
                }
              />
            );
          })}
        </TeamList>
      )}
      </TeamSection>

      <ConfirmDialog
        open={Boolean(declining)}
        title={declining ? `Decline ${[declining.firstName, declining.lastName].filter(Boolean).join(" ") || "this application"}?` : "Decline application?"}
        body="They won't join this pharmacy. They can apply again with a new invite link."
        confirmLabel="Decline"
        busyLabel="Declining…"
        busy={declineBusy}
        onConfirm={() => declining && void handleReject(declining)}
        onClose={() => setDeclining(null)}
      />

      <MembershipApplicationReviewDialog
        open={Boolean(reviewing)}
        application={reviewing}
        defaultEmploymentType={
          reviewing?.category === "LOCUM_CASUAL"
            ? deriveLocumEmploymentType(reviewing?.role)
            : defaultEmploymentType
        }
        allowedEmploymentTypes={allowedTypes}
        onClose={() => setReviewing(null)}
        onUpdated={(updated) => {
          setReviewing(updated);
          setApplications((rows) => rows.map((row) => row.id === updated.id ? updated : row));
        }}
        onApproved={async () => {
          setReviewing(null);
          await fetchApplications();
          onApproved?.();
        }}
        onNotification={notify}
      />
    </Box>
  );
}
