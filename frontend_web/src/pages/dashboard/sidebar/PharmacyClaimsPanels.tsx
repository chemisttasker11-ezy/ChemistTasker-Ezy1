import type { Dispatch, SetStateAction } from "react";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import {
  type ClaimStatus,
  type OrganizationClaimItem,
  type OwnerClaimRequest,
  CLAIM_STATUS_COLORS,
  formatDateTime,
} from "./PharmacyPage.model";

const LIGHT_BORDER = "#D9E2F2";
const DASHBOARD_FONT_FAMILY = '"DM Sans Variable", "DM Sans", "Barlow", Arial, sans-serif';
const DASHBOARD_INK = "#06123A";
const DASHBOARD_MUTED = "#5E6B8D";

const pharmacyPageFrameSx = {
  width: "100%",
  maxWidth: "none",
  mx: "auto",
  px: { xs: 0, sm: 1.5, md: 2, xl: 3 },
  fontFamily: DASHBOARD_FONT_FAMILY,
} as const;

type Props = {
  view: string;
  isOrganizationUser: boolean;
  standalone: boolean;
  claimedPharmacyCount: number;

  claimAccordionOpen: boolean;
  setClaimAccordionOpen: Dispatch<SetStateAction<boolean>>;
  claimCounts: { pending: number; accepted: number };
  claimError: string | null;
  claimEmail: string;
  setClaimEmail: Dispatch<SetStateAction<string>>;
  handleSubmitClaim: () => void | Promise<void>;
  claimSubmitting: boolean;
  claimsLoading: boolean;
  claimItems: OrganizationClaimItem[];

  ownerAccordionOpen: boolean;
  setOwnerAccordionOpen: Dispatch<SetStateAction<boolean>>;
  ownerClaimCounts: { pending: number; accepted: number };
  ownerClaimError: string | null;
  ownerClaimsLoading: boolean;
  ownerClaims: OwnerClaimRequest[];
  canRespondToClaims: boolean;
  openOwnerClaimDialog: (claim: OwnerClaimRequest, action: ClaimStatus) => void;
};

export default function PharmacyClaimsPanels({
  view,
  isOrganizationUser,
  standalone,
  claimedPharmacyCount,
  claimAccordionOpen,
  setClaimAccordionOpen,
  claimCounts,
  claimError,
  claimEmail,
  setClaimEmail,
  handleSubmitClaim,
  claimSubmitting,
  claimsLoading,
  claimItems,
  ownerAccordionOpen,
  setOwnerAccordionOpen,
  ownerClaimCounts,
  ownerClaimError,
  ownerClaimsLoading,
  ownerClaims,
  canRespondToClaims,
  openOwnerClaimDialog,
}: Props) {
  return (
    <>
      {view === "list" && isOrganizationUser && !standalone && (
        <Box sx={{ ...pharmacyPageFrameSx, pt: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box>
              <Typography sx={{ fontSize: { xs: 28, md: 34 }, lineHeight: 1.08, fontWeight: 950, color: DASHBOARD_INK }}>
                Claim Pharmacies & Requests
              </Typography>
              <Typography sx={{ mt: 1, color: DASHBOARD_MUTED, fontSize: { xs: 15, md: 16 }, fontWeight: 800, lineHeight: 1.45 }}>
                Link new pharmacies to your organization and track pending claim activity.
              </Typography>
            </Box>
            <Button
              variant="contained"
              sx={{
                ml: { sm: "auto" },
                minHeight: 46,
                px: 2.25,
                borderRadius: "12px",
                fontWeight: 900,
                boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)",
              }}
              onClick={() => setClaimAccordionOpen((prev) => !prev)}
            >
              {claimAccordionOpen ? "Hide Claim Form" : "Claim Pharmacy"}
            </Button>
          </Stack>

          <Accordion
            expanded={claimAccordionOpen}
            onChange={(_, expanded) => setClaimAccordionOpen(expanded)}
            sx={{
              mt: 2,
              borderRadius: "20px !important",
              border: `1px solid ${LIGHT_BORDER}`,
              boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
              overflow: "hidden",
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 1, sm: 3 }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                sx={{ width: "100%" }}
              >
                <Typography sx={{ color: DASHBOARD_INK, fontWeight: 900, fontSize: 18 }}>
                  Submit a claim by email
                </Typography>
                <Stack direction="row" spacing={3}>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Pending: <strong>{claimCounts.pending}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Accepted: <strong>{claimCounts.accepted}</strong>
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {claimError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {claimError}
                </Alert>
              )}
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={2}
                alignItems={{ xs: "stretch", sm: "flex-end" }}
              >
                <TextField
                  fullWidth
                  label="Pharmacy Email"
                  value={claimEmail}
                  onChange={(event) => setClaimEmail(event.target.value)}
                />
                <Button
                  variant="contained"
                  onClick={handleSubmitClaim}
                  disabled={claimSubmitting}
                  sx={{ minWidth: 160, minHeight: 48, borderRadius: "12px", fontWeight: 900, boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)" }}
                >
                  {claimSubmitting ? <CircularProgress size={20} color="inherit" /> : "Submit Claim"}
                </Button>
              </Stack>

              {claimsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 3 }}>
                  <CircularProgress size={28} />
                </Box>
              ) : claimItems.length === 0 ? (
                <Typography sx={{ mt: 3 }} color="text.secondary">
                  No claim activity yet.
                </Typography>
              ) : (
                <Table sx={{ mt: 3 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Pharmacy</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Requested</TableCell>
                      <TableCell>Responded</TableCell>
                      <TableCell>Response Note</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {claimItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Typography fontWeight={600}>{item.pharmacy?.name ?? "Untitled Pharmacy"}</Typography>
                          {item.pharmacy?.email && (
                            <Typography variant="body2" color="text.secondary">
                              {item.pharmacy.email}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell>
                          <Chip
                            label={item.status_display ?? item.status}
                            color={CLAIM_STATUS_COLORS[item.status]}
                            size="small"
                          />
                        </TableCell>
                        <TableCell>{formatDateTime(item.created_at)}</TableCell>
                        <TableCell>{formatDateTime(item.responded_at)}</TableCell>
                        <TableCell sx={{ maxWidth: 280 }}>
                          {item.response_message ? (
                            <Typography variant="body2">{item.response_message}</Typography>
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              {item.status === "PENDING" ? "Awaiting owner decision" : "-"}
                            </Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}

      {view === "list" && !isOrganizationUser && !standalone && claimedPharmacyCount > 0 && (
        <Box sx={{ ...pharmacyPageFrameSx, pt: 3 }}>
          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={1.5}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Box>
              <Typography sx={{ fontSize: { xs: 28, md: 34 }, lineHeight: 1.08, fontWeight: 950, color: DASHBOARD_INK }}>
                Claim Requests
              </Typography>
              <Typography sx={{ mt: 1, color: DASHBOARD_MUTED, fontSize: { xs: 15, md: 16 }, fontWeight: 800, lineHeight: 1.45 }}>
                Organizations can request access to manage your pharmacies. Review and respond to requests below.
              </Typography>
            </Box>
            <Button
              variant="contained"
              sx={{
                ml: { sm: "auto" },
                width: { xs: "100%", sm: "auto" },
                minHeight: 46,
                px: 2.25,
                borderRadius: "12px",
                fontWeight: 900,
                boxShadow: "0 12px 28px rgba(20, 62, 234, 0.18)",
              }}
              onClick={() => setOwnerAccordionOpen((prev) => !prev)}
            >
              {ownerAccordionOpen ? "Hide Requests" : "View Requests"}
            </Button>
          </Stack>

          <Accordion
            expanded={ownerAccordionOpen}
            onChange={(_, expanded) => setOwnerAccordionOpen(expanded)}
            sx={{
              mt: 2,
              borderRadius: "20px !important",
              border: `1px solid ${LIGHT_BORDER}`,
              boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
              overflow: "hidden",
              "&:before": { display: "none" },
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />}>
              <Stack
                direction={{ xs: "column", sm: "row" }}
                spacing={{ xs: 1, sm: 3 }}
                alignItems={{ xs: "flex-start", sm: "center" }}
                justifyContent="space-between"
                sx={{ width: "100%" }}
              >
                <Typography sx={{ color: DASHBOARD_INK, fontWeight: 900, fontSize: 18 }}>
                  Organization claim requests
                </Typography>
                <Stack direction="row" spacing={3}>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Pending: <strong>{ownerClaimCounts.pending}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 800 }}>
                    Accepted: <strong>{ownerClaimCounts.accepted}</strong>
                  </Typography>
                </Stack>
              </Stack>
            </AccordionSummary>
            <AccordionDetails>
              {ownerClaimError && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {ownerClaimError}
                </Alert>
              )}

              {ownerClaimsLoading ? (
                <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
                  <CircularProgress size={32} />
                </Box>
              ) : ownerClaims.length === 0 ? (
                <Alert severity="info">No claim requests at the moment.</Alert>
              ) : (
                <Stack spacing={2.5}>
                  {ownerClaims.map((claim) => (
                    <Paper
                      key={claim.id}
                      variant="outlined"
                      sx={{
                        borderRadius: { xs: "16px", md: "20px" },
                        p: { xs: 2, md: 2.5 },
                        borderColor: "#E5ECF7",
                        boxShadow: "0 8px 24px rgba(6, 18, 58, 0.06)",
                        transition: "transform 0.2s ease, box-shadow 0.2s ease",
                        "&:hover": {
                          transform: { xs: "none", md: "translateY(-3px)" },
                          boxShadow: "0 18px 42px rgba(6, 18, 58, 0.12)",
                        },
                      }}
                    >
                      <Stack spacing={1.5}>
                        <Stack
                          direction={{ xs: "column", sm: "row" }}
                          spacing={1}
                          alignItems={{ xs: "flex-start", sm: "center" }}
                          justifyContent="space-between"
                        >
                          <Box sx={{ minWidth: 0 }}>
                            <Typography sx={{ color: DASHBOARD_INK, fontWeight: 950, fontSize: { xs: 20, md: 22 }, lineHeight: 1.15 }}>
                              {claim.pharmacy?.name ?? "Untitled Pharmacy"}
                            </Typography>
                            {claim.pharmacy?.email && (
                              <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 700 }}>
                                {claim.pharmacy.email}
                              </Typography>
                            )}
                          </Box>
                          <Chip
                            label={claim.status_display ?? claim.status}
                            color={CLAIM_STATUS_COLORS[claim.status]}
                            variant={claim.status === "PENDING" ? "outlined" : "filled"}
                            size="small"
                          />
                        </Stack>

                        <Typography variant="body2" sx={{ color: DASHBOARD_MUTED, fontWeight: 700 }}>
                          Requested by <strong>{claim.organization?.name ?? "Unknown organization"}</strong>
                          {" on "}
                          {formatDateTime(claim.created_at)}
                        </Typography>

                        {claim.message && (
                          <Box sx={{ p: 2, borderRadius: 2, bgcolor: "grey.100", fontStyle: "italic" }}>
                            "{claim.message}"
                          </Box>
                        )}

                        {claim.status !== "PENDING" && claim.response_message && (
                          <Typography variant="body2" color="text.secondary">
                            Your response: {claim.response_message}
                          </Typography>
                        )}

                        {claim.status === "PENDING" && (
                          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                            <Button
                              variant="contained"
                              color="success"
                              disabled={!canRespondToClaims}
                              sx={{ minHeight: 42, borderRadius: "12px", fontWeight: 900 }}
                              onClick={() => canRespondToClaims && openOwnerClaimDialog(claim, "ACCEPTED")}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outlined"
                              color="error"
                              disabled={!canRespondToClaims}
                              sx={{ minHeight: 42, borderRadius: "12px", fontWeight: 900 }}
                              onClick={() => canRespondToClaims && openOwnerClaimDialog(claim, "REJECTED")}
                            >
                              Reject
                            </Button>
                            {!canRespondToClaims && (
                              <Typography variant="body2" color="text.secondary">
                                Only owner-level administrators can respond to requests.
                              </Typography>
                            )}
                          </Stack>
                        )}
                      </Stack>
                    </Paper>
                  ))}
                </Stack>
              )}
            </AccordionDetails>
          </Accordion>
        </Box>
      )}
    </>
  );
}
