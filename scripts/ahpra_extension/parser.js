/* Classic script, also loadable by Node. */
function parseRecordText(text, registrationNumber) {
  const lines = String(text).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const header = lines.indexOf('Registration Details');
  const headings = /^(Registration details|Profession|Registration number|Registration status|Registration expiry date|Date of first Registration.*|Registration Type.*|Conditions?|Undertakings?|Reprimands?|Endorsements?|Notations?|Registration Requirements?|Personal details)$/i;
  const field = label => {
    const i = lines.findIndex(s => s.toLowerCase() === label.toLowerCase());
    const value = i < 0 ? '' : lines[i + 1] || '';
    return headings.test(value) ? '' : value;
  };
  function present(plural, singular) {
    let found = false;
    const restricted = lines.some((line, i) => {
      if (line.toLowerCase() !== plural.toLowerCase()) return false;
      found = true;
      let j = i + 1;
      if ((lines[j] || '').toLowerCase() === singular.toLowerCase()) j++;
      return !!lines[j] && !/^none\.?$/i.test(lines[j]) && !headings.test(lines[j]);
    });
    return found ? restricted : null;
  }
  const start = lines.findIndex(s => /^Registration Requirement$/i.test(s));
  const end = lines.findIndex((s, i) => i > start && /^Personal details$/i.test(s));
  let requirements = start < 0 ? '' : lines.slice(start + 1, end < 0 ? undefined : end).join(' ').replace(/\s+/g, ' ').trim();
  if (/^none\.?$/i.test(requirements)) requirements = '';
  let expiry = null;
  lines.forEach((line, i) => {
    if (!/^Registration Expiry Date$/i.test(line)) return;
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(lines[i + 1] || '');
    if (!m) return;
    const iso = `${m[3]}-${m[2]}-${m[1]}`;
    const date = new Date(`${iso}T00:00:00Z`);
    if (!Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === iso) expiry = iso;
  });
  const cleanNum = String(registrationNumber || '').trim();
  let noIndex = -1;
  if (cleanNum) {
    const numPattern = cleanNum.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
    const regNoRegex = new RegExp(`^No\\.\\s*${numPattern}$`, 'i');
    noIndex = lines.findIndex(s => regNoRegex.test(s));
    if (noIndex < 0) {
      const target = ('no.' + cleanNum).replace(/\s+/g, '').toLowerCase();
      noIndex = lines.findIndex(s => s.replace(/\s+/g, '').toLowerCase() === target);
    }
  }
  let name = '';
  if (noIndex >= 0) {
    for (let i = noIndex - 3; i >= 0; i--) {
      const line = lines[i];
      if (headings.test(line)) break;
      if (/^(Start new search|Back to search results|Print this page)$/i.test(line)) continue;
      name = line;
      break;
    }
  } else {
    name = header >= 0 && !headings.test(lines[header + 1] || '') ? lines[header + 1] || '' : '';
  }
  const type = lines.find(s => /^Registration Type\s*[-–:]\s*\S/i.test(s));
  const headerType = noIndex >= 1 ? lines[noIndex - 1] : (header >= 0 && /^No\.\s*/i.test(lines[header + 4] || '') ? lines[header + 3] : '');
  return {
    name,
    profession: field('Profession') || (noIndex >= 2 ? lines[noIndex - 2] : (header >= 0 ? lines[header + 2] || '' : '')),
    registration_status: field('Registration status'),
    registration_type: type ? type.replace(/^Registration Type\s*[-–:]\s*/i, '') : headerType,
    expiry_date: expiry,
    conditions: present('Conditions', 'Condition'),
    undertakings: present('Undertakings', 'Undertaking'),
    reprimands: present('Reprimands', 'Reprimand'),
    registration_requirements: requirements.slice(0, 1000),
    supervised_practice: /supervis/i.test(requirements)
  };
}
if (typeof module !== 'undefined') module.exports = { parseRecordText };
