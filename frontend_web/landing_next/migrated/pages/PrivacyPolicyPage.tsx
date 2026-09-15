import { useEffect } from "react";
import { Container, Paper, Typography, Box, Divider } from "@mui/material";
import PublicLogoTopBar from "../components/PublicLogoTopBar";
import { setCanonical, setPageMeta, setSocialMeta } from "../utils/seo";

export default function PrivacyPolicyPage() {
  useEffect(() => {
    const title = "Privacy Policy | ChemistTasker";
    const description =
      "Read how ChemistTasker collects, uses, and protects your data across the website and mobile app.";
    const origin = window.location.origin;
    const url = `${origin}/privacy-policy`;
    const image = `${origin}/images/ChatGPT Image Jan 18, 2026, 08_14_43 PM.png`;
    setPageMeta(title, description);
    setCanonical(url);
    setSocialMeta({ title, description, url, image, type: "website" });
  }, []);

  return (
    <>
      <PublicLogoTopBar />
      <Container maxWidth="md" sx={{ mt: 8, mb: 8 }}>
        <Paper elevation={3} sx={{ p: { xs: 2, sm: 5 }, borderRadius: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center">
          Privacy Policy
        </Typography>
        <Typography variant="subtitle2" color="text.secondary" align="center" gutterBottom>
          Effective Date: 15 January 2026
        </Typography>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>1. Scope</Typography>
          <Typography paragraph>
            This Privacy Policy explains how CHEMISTTASKER PTY LTD ("ChemistTasker", "we", "us")
            collects, uses, and shares information about users of the ChemistTasker mobile app and
            website, including both authenticated and non-authenticated use.
          </Typography>
        </Box>

        <Divider sx={{ my: 3 }} />

        <Box sx={{ mt: 2 }}>
          <Typography variant="h5" gutterBottom>2. Information We Collect</Typography>
          <Typography paragraph>
            We collect information needed to operate the app and website, support pharmacy
            management workflows, and secure the platform. Depending on how you interact with
            ChemistTasker, we may collect:
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <li>
              <Typography paragraph>
                Account and profile data such as name, email, phone number, role, organization,
                professional details, and verification information when you register or sign in.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Work and shift data such as availability, rosters, shift applications, assignments,
                confirmations, and related communications.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Verification and compliance documents (web and mobile), such as government IDs,
                AHPRA or other credentials, resumes, certificates, and profile photos, where required
                for onboarding or compliance.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Payment and invoicing data (if applicable): ChemistTasker does not currently take
                in-app payments. Billing and invoicing information may be processed via our web/admin
                workflows if enabled in the future. If payment processing is introduced, card details
                will be handled by our payment processors and we will receive only tokens, billing
                details, and transaction status — not full card numbers.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Device and usage data, such as device identifiers, IP address, browser type, app
                version, pages or screens viewed, timestamps, and referring URLs.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Push notification tokens used to deliver alerts about shifts, messages, and
                platform updates.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Address-based location data you enter or select (including Google Places
                autocomplete), such as street address, suburb, state, and postcode. If we introduce
                device GPS in the future, we will ask for explicit permission.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Cookies or similar technologies used for analytics, performance, and preferences on
                the website.
              </Typography>
            </li>
          </Box>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>3. Legal Bases (where required)</Typography>
          <Typography paragraph>
            We process personal information based on one or more of the following legal bases:
            consent (for optional features like precise location), legitimate interests (to operate
            and secure the website and app), and to take steps at your request or perform a contract
            (such as onboarding, shift scheduling, or invoicing).
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>4. How We Use Information</Typography>
          <Typography paragraph>
            We use information to:
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <li>
              <Typography paragraph>
                Provide and maintain the ChemistTasker app and website, including public pages and
                authenticated features.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Create and manage accounts, verify identities where needed, and enable shift and
                workforce management workflows.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Support billing and invoicing workflows where applicable (if enabled).
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Send service notifications and operational messages.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Improve performance, diagnose issues, prevent abuse, and secure our systems.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Meet legal, regulatory, and professional obligations relevant to pharmacy operations.
              </Typography>
            </li>
          </Box>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>5. Sharing and Disclosure</Typography>
          <Typography paragraph>
            We do not sell your personal information. We may share information with trusted service
            providers that help us operate our website and pharmacy management services, such as:
          </Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <li>
              <Typography paragraph>
                Hosting and infrastructure providers.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Push notification delivery providers (including Expo push services and FCM/APNs
                where applicable).
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Payment processors for handling billing and transaction processing.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Storage providers for user-submitted files (such as Azure Blob Storage).
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Customer support, communications, and security tooling vendors.
              </Typography>
            </li>
          </Box>
          <Typography paragraph>
            We may also disclose information if required by law, to protect rights and safety, or in
            connection with a business transaction such as a merger or asset sale.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>6. Data Retention</Typography>
          <Typography paragraph>
            We retain personal information only as long as needed for the purposes described above,
            unless a longer retention period is required by law or for legitimate business needs.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>7. Security</Typography>
          <Typography paragraph>
            We implement technical and organizational safeguards to protect information against
            unauthorized access, loss, misuse, or alteration. No method of transmission or storage
            is completely secure, so we cannot guarantee absolute security.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>8. Your Rights and Choices</Typography>
          <Box component="ul" sx={{ pl: 3, m: 0 }}>
            <li>
              <Typography paragraph>
                Cookies: You can adjust your browser settings to refuse or delete cookies. Some site
                features may not function properly without them.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Location: You can disable location services in your device or browser settings.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Communications: You can opt out of marketing communications at any time by using the
                unsubscribe link or contacting us.
              </Typography>
            </li>
            <li>
              <Typography paragraph>
                Access, correction, and deletion: You can request access, correction, or deletion of
                your personal information by contacting us at the email address below. We may need
                to verify your identity and retain certain records for legal or regulatory reasons.
                You may also request account deletion from within the app (if available) or by
                emailing us.
              </Typography>
            </li>
          </Box>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>9. International Transfers</Typography>
          <Typography paragraph>
            ChemistTasker is based in Australia. Your information may be processed in Australia or
            in other countries where our service providers operate. We take steps to ensure your
            data is handled in line with applicable privacy laws.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>10. Children's Privacy</Typography>
          <Typography paragraph>
            ChemistTasker is not directed to children under 16. We do not knowingly collect personal
            information from children. If you believe a child has provided us with personal data,
            please contact us so we can take appropriate action.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>11. Third-Party Links</Typography>
          <Typography paragraph>
            Our app or website may include links to third-party sites or services. We are not
            responsible for the privacy practices of those third parties. Please review their
            policies before providing any information.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>12. Changes to This Policy</Typography>
          <Typography paragraph>
            We may update this Privacy Policy from time to time. Changes will be posted on this page
            with a revised effective date.
          </Typography>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h5" gutterBottom>13. Contact Us</Typography>
          <Typography paragraph>
            For privacy questions or requests, contact us at:
            <br />
            <a href="mailto:info@chemisttasker.com">info@chemisttasker.com.au</a>
          </Typography>
        </Box>

        <Box sx={{ mt: 6, textAlign: "center" }}>
          <Typography variant="subtitle2" color="text.secondary">
            &copy; {new Date().getFullYear()} CHEMISTTASKER PTY LTD. All rights reserved.
          </Typography>
        </Box>
        </Paper>
      </Container>
    </>
  );
}
