# Skills used by the mobile-mirror workflow

Every UI brief names the design skills; builders read them before editing. Licences are kept next to each copy.

| Skill | Where | Licence | Use it for |
|---|---|---|---|
| ui-ux-pro-max | `.agents/skills/ui-ux-pro-max` | (repo copy) | layout, palette, typography, UX guidelines |
| design-taste-frontend ("taste") | `.agents/skills/design-taste-frontend` | (repo copy) | run its pre-flight before any UI change |
| design, design-system, ui-styling, brand | `.agents/skills/*` | (repo copy) | tokens, brand rules |
| impeccable | `.claude/skills/impeccable` | Apache 2.0 (see its SKILL.md) | critique, polish, harden, accessibility, empty/error states |
| vercel-react-native-skills | `.claude/skills/vercel-react-native-skills` | MIT | React Native / Expo performance and patterns |
| Expo skills (expo-native-ui, expo-ui, expo-router, expo-upgrade, eas-*, ...) | `.claude/skills/expo/*` | MIT, `expo/LICENSE` | native UI, routing, SDK upgrades, EAS builds and store |
| ponytail (+ review, audit) | `.claude/skills/ponytail/*` | MIT, `ponytail/LICENSE` | smallest complete change; `ponytail-review` for quality review |
| transitions-dev, transitions-polish | NOT copied (licence forbids redistribution) | https://transitions.dev | motion rules only (RN has no CSS); install from the source |
| make-interfaces-feel-better | NOT copied (no licence in our copy) | install from its author | polish details: radius, shadows, icons, press states |
| web-design-guidelines (Vercel) | NOT copied (no licence in our copy) | install from Vercel's agent-skills | web interface guideline review |

How these are used, who builds and who reviews: `docs/mobile/AGENT_WORKFLOW.md`.
