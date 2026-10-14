// Pharmacy team profile (assistant, technician, intern, student) on the shared onboarding shell.
import * as React from "react";
import { GraduationCap, FileText, IdCard, ListChecks, UserRound, Users, Wallet } from "lucide-react";
import OnboardingShell, { type OnboardingStep } from "../OnboardingShell";
import { otherStaffRoleLabel } from "../../../utils/roleLabels";
import BasicInfoV2 from "./BasicInfoV2";
import SkillsV2 from "./SkillsV2";
import PaymentV2 from "./PaymentV2";
import RefereesV2 from "./RefereesV2";
import ProfileV2 from "./ProfileV2";
import IdentityV2 from "./IdentityV2";
import RegulatoryV2 from "./RegulatoryV2";

// Keys stay as before: links into ?step= keep working.
const STEPS: OnboardingStep[] = [
  { key: "basic", label: "Basics", title: "Basic info", icon: UserRound, tone: "violet", purpose: "Your name, contact details and where you can work. Pharmacies use your suburb to match nearby shifts.", render: () => <BasicInfoV2 /> },
  { key: "regulatory docs", label: "Role", title: "Role & qualifications", icon: GraduationCap, tone: "blue", purpose: "Your role and award level. Interns add their AHPRA number; certificates are optional and earn a Qualification badge.", render: () => <RegulatoryV2 /> },
  { key: "skills", label: "Skills", title: "Skills & software", icon: ListChecks, tone: "cyan", purpose: "What you have done on the job. Certificates are optional and earn a Verified mark on that skill.", render: () => <SkillsV2 /> },
  { key: "identity", label: "Photo ID", icon: IdCard, tone: "magenta", purpose: "Optional. A checked photo ID earns the Photo ID badge pharmacies look for.", render: () => <IdentityV2 /> },
  { key: "payment", label: "Getting paid", title: "How you get paid", icon: Wallet, tone: "violet", purpose: "How pharmacies pay you for shifts: ABN or TFN, bank account and super. This is not a ChemistTasker fee.", render: () => <PaymentV2 /> },
  { key: "referees", label: "References", icon: Users, tone: "blue", purpose: "Optional. Two referees who confirm earn the References badge.", render: () => <RefereesV2 /> },
  { key: "profile", label: "Profile", title: "Profile & CV", icon: FileText, tone: "cyan", purpose: "Your photo, a short bio and your CV: what pharmacies read first.", render: () => <ProfileV2 /> },
];

export default function OtherStaffOnboardingV2Layout() {
  const [roleType, setRoleType] = React.useState<string | null>(null);
  return (
    <OnboardingShell
      roleKey="otherstaff"
      title="Your profile"
      subtitle={`Pharmacy team · ${otherStaffRoleLabel(roleType, "choose your role")}. Complete what is required to apply for shifts; the rest earns badges.`}
      steps={STEPS}
      role={roleType}
      onDetail={detail => setRoleType(detail?.role_type ?? null)}
      targets={{ mobile: { path: "/mobile-verify" }, ahpra: { step: "regulatory docs" }, role: { step: "regulatory docs" }, gov_id: { step: "identity" }, referees: { step: "referees" } }}
    />
  );
}
