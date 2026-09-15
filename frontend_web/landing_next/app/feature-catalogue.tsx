const groups = [
 {title:'Locum shifts & pharmacy jobs',items:['Browse public pharmacy opportunities','Find shifts by location and dates','Apply for suitable shifts from your account','Manage active and confirmed shifts']},
 {title:'Talent & availability',items:['Discover pharmacy talent','Publish professional availability','Compare experience and work preferences','Keep your profile and onboarding up to date']},
 {title:'Connected pharmacy teams',items:['Coordinate rosters and team availability','Keep tasks and events in a shared calendar','Manage pharmacy memberships','Work across authorised pharmacy locations']},
 {title:'Community & knowledge',items:['Six public platform hubs','Comments, reactions and community polls','Blog articles and pharmacy news','Private pharmacy and organisation discussions']},
 {title:'Invoices & administration',items:['Prepare shift invoices','Keep invoice records together','Review work and payment status','Access administration tools according to your role']},
 {title:'One account, clear access',items:['Public pages and private dashboards','Owner, pharmacist, intern, Other Staff and Explorer communities','Separate editorial publishing responsibilities','Authorised organisation and internal staff spaces']},
];

export default function FeatureCatalogue() {
  return <section id="all-features" className="section container catalogue-section"><div className="section-heading"><div><p className="eyebrow">THE WHOLE PLATFORM, IN VIEW</p><h2>More than filling a shift.</h2></div><p>Start with the shift you need. Keep hiring, availability, team coordination and community close at hand.</p></div><div className="catalogue-grid">{groups.map((group, i) => <details key={group.title}><summary><span className="catalogue-number">0{i+1}</span><span>{group.title}<small>{group.items.length} capabilities</small></span><span className="catalogue-plus">+</span></summary><ul>{group.items.map(item => <li key={item}>{item}</li>)}</ul></details>)}</div><p className="catalogue-disclaimer">Your available tools depend on your professional role, verification, memberships and plan. Public communities and private team spaces have different audiences.</p></section>;
}
