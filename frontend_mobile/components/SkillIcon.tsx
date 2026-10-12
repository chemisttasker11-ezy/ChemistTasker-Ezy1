import { Image, View } from 'react-native';
import registry from '@chemisttasker/shared-core/skills_registry.json';
import { findSkill } from '@chemisttasker/shared-core';
import { SKILL_SYMBOLS } from '../assets/skill-symbols';

// Vendors' own compact marks, unaltered (see shared-core/skills_registry.json software_logos).
const SOFTWARE_MARKS: Record<string, number> = {
  fred: require('../assets/software-logos/fred.png'),
  rxone: require('../assets/software-logos/rxone.png'),
  strongroom: require('../assets/software-logos/strongroom.png'),
  minfos: require('../assets/software-logos/minfos.png'),
  zsoftware: require('../assets/software-logos/zsoftware.png'),
  medimap: require('../assets/software-logos/medimap.png'),
  mypak: require('../assets/software-logos/mypak.png'),
  mpsconnect: require('../assets/software-logos/mpsconnect.png'),
  dispenseworks: require('../assets/software-logos/dispenseworks.png'),
  webstercare: require('../assets/software-logos/webstercare.png'),
};

/** Same skill symbols as web (rendered from shared/SkillGlyph.tsx); named software shows its vendor mark. Labels stay visible. */
export function SkillIcon({ skill, size = 18 }: { skill: string; size?: number }) {
  const definition = findSkill(registry as any, skill) as any;
  const mark = definition?.logo ? SOFTWARE_MARKS[definition.logo] : undefined;
  if (mark) {
    return <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.24), borderWidth: 1, borderColor: 'rgba(6,33,74,0.14)', backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Image source={mark} style={{ width: size - 4, height: size - 4 }} resizeMode="contain" accessible={false} />
    </View>;
  }
  const symbol = definition ? SKILL_SYMBOLS[definition.code] : undefined;
  if (!symbol) return <View style={{ width: size, height: size }} />;
  return <Image source={symbol} style={{ width: size, height: size }} resizeMode="contain" accessible={false} />;
}
