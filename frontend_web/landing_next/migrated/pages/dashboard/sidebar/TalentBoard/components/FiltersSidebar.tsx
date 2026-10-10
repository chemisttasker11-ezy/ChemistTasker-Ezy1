import type { ComponentProps } from 'react';
import SkillIcon from '@/public/skill-icon';
import TalentFiltersSidebar from '../../../../../../shared-ui/talent/FiltersSidebar';

export type { TalentFilterState } from '../../../../../../shared-ui/talent/FiltersSidebar';

/** The shared talent filters with the public site's skill icons. */
export default function FiltersSidebar(props: Omit<ComponentProps<typeof TalentFiltersSidebar>, 'renderSkillIcon'>) {
  return <TalentFiltersSidebar {...props} renderSkillIcon={(skill) => <SkillIcon skill={skill} />} />;
}
