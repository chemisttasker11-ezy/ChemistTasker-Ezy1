import { Box, Typography } from "@mui/material";
import LegalDocumentShell from "../components/LegalDocumentShell";

export default function AccountDeletionPage() {
  return (
    <LegalDocumentShell title="Account deletion" effectiveDate="ChemistTasker Pty Ltd">
      <Box sx={{ mt: 3 }}>
        <Typography variant="h5">How to delete your account</Typography>
        <Typography paragraph>
          In the web app: Profile -&gt; Danger Zone -&gt; Delete My Account.
        </Typography>
        <Typography paragraph>
          In the mobile app: Profile -&gt; Delete My Account.
        </Typography>
        <Typography paragraph>
          If you cannot access the app, email{" "}
          <a href="mailto:info@chemisttasker.com?subject=Account%20Deletion">
            info@chemisttasker.com
          </a>{" "}
          with subject "Account Deletion" and include your registered email and/or phone number.
        </Typography>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5">Deletion timeline</Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <li>Immediate account deactivation and sign-in blocked.</li>
          <li>Verification documents removed within 7 days.</li>
          <li>Some data may be retained for legal or compliance reasons.</li>
        </Box>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5">Data deleted</Typography>
        <Box component="ul" sx={{ pl: 3 }}>
          <li>Profile information and identifiers.</li>
          <li>Verification documents.</li>
          <li>Authentication and push notification tokens.</li>
        </Box>
      </Box>

      <Box sx={{ mt: 4 }}>
        <Typography variant="h5">Data retained</Typography>
        <Typography paragraph>
          We retain shift history, invoices, and audit logs where required by law or
          compliance. These records are retained without personal identifiers where possible.
        </Typography>
      </Box>
    </LegalDocumentShell>
  );
}
