import { Box, Container, Paper, Typography } from "@mui/material";

export default function AccountDeletionPage() {
  return (
    <Container maxWidth="md" sx={{ mt: 8, mb: 8 }}>
      <Paper elevation={3} sx={{ p: { xs: 2, sm: 5 }, borderRadius: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          Account Deletion
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" align="center" gutterBottom>
          ChemistTasker Pty Ltd
        </Typography>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            How to delete your account
          </Typography>
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
          <Typography variant="h5" gutterBottom>
            Deletion timeline
          </Typography>
          <ul style={{ marginLeft: "1.5rem" }}>
            <li>Immediate account deactivation and sign-in blocked.</li>
            <li>Verification documents removed within 7 days.</li>
            <li>Some data may be retained for legal or compliance reasons.</li>
          </ul>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Data deleted
          </Typography>
          <ul style={{ marginLeft: "1.5rem" }}>
            <li>Profile information and identifiers.</li>
            <li>Verification documents.</li>
            <li>Authentication and push notification tokens.</li>
          </ul>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>
            Data retained
          </Typography>
          <Typography paragraph>
            We retain shift history, invoices, and audit logs where required by law or
            compliance. These records are retained without personal identifiers where possible.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}
