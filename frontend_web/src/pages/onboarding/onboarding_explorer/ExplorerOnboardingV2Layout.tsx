// New to pharmacy profile on the shared onboarding shell.
import { FileText, Heart, IdCard, UserRound, Users } from "lucide-react";
import OnboardingShell, { type OnboardingStep } from "../OnboardingShell";
import BasicInfoV2 from "./BasicInfoV2";
import IdentityV2 from "./IdentityV2";
import InterestsV2 from "./InterestsV2";
import RefereesV2 from "./RefereesV2";
import ProfileV2 from "./ProfileV2";

// Keys stay as before: links into ?step= keep working.
const STEPS: OnboardingStep[] = [
  { key: "basic", label: "Basic info", icon: UserRound, tone: "violet", purpose: "Your name, contact details and where you are. Pharmacies use your location to find you.", render: () => <BasicInfoV2 /> },
  { key: "interests", label: "What you're looking for", icon: Heart, tone: "magenta", purpose: "Placement, work experience or a first job: tell pharmacies what you want to try.", render: () => <InterestsV2 /> },
  { key: "identity", label: "Photo ID", icon: IdCard, tone: "blue", purpose: "Optional, unless you skipped the Australian mobile check: then photo ID verifies your profile.", render: () => <IdentityV2 /> },
  { key: "referees", label: "References", icon: Users, tone: "cyan", purpose: "Optional. A teacher, manager or mentor who confirms earns the References badge.", render: () => <RefereesV2 /> },
  { key: "profile", label: "Profile & CV", icon: FileText, tone: "violet", purpose: "Your photo, a short bio and your CV: what pharmacies read first.", render: () => <ProfileV2 /> },
];

export default function ExplorerOnboardingV2Layout() {
  return (
    <OnboardingShell
      roleKey="explorer"
      title="Your profile"
      subtitle="New to pharmacy. Verify your mobile (or photo ID if you are overseas) to post on the talent hub."
      steps={STEPS}
      role="EXPLORER"
      targets={{ mobile: { path: "/mobile-verify" }, gov_id: { step: "identity" }, referees: { step: "referees" } }}
    />
  );
}
