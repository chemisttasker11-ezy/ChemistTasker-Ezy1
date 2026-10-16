"""Editable starting points adapted from practical Australian pharmacy operations.

Templates are suggestions, not regulatory certifications. Store-specific SOPs
and current program rules must be reviewed by the responsible pharmacist.
"""
from copy import deepcopy

CATEGORIES = [
    ("opening", "Opening"), ("closing", "Closing"), ("dispensary", "Dispensary"),
    ("front_shop", "Front shop"), ("daa", "DAA / packing"), ("clinical", "Clinical services"),
    ("weekly", "Weekly governance"), ("monthly", "Monthly reporting"),
    ("training", "Training"), ("safety", "Safety / exceptions"),
]

def _row(name, category, area, steps, *, roles=None, freq="DAILY", weekday=None,
         requires_verification=False, target_value=None, target_unit="", target_kind="operational"):
    recurrence = {"freq": freq}
    if weekday is not None:
        recurrence["byweekday"] = weekday
    return {
        "name": name, "category": category, "area": area,
        "description": "Confirm against the pharmacy's current standard operating procedure.",
        "recurrence": recurrence, "audience": "ROLE_ON_DUTY",
        "role_codes": roles or [], "checklist": [
            {"id": str(i + 1), "label": text, "required": True}
            for i, text in enumerate(steps)
        ],
        "requires_verification": requires_verification, "target_value": target_value,
        "target_unit": target_unit, "target_kind": target_kind, "training_url": "",
    }


STARTER_TEMPLATES = [
    _row("Opening readiness", "opening", "dispensary", [
        "Review handover and urgent owing prescriptions", "Confirm workstation and dispensary readiness",
        "Record current, minimum and maximum vaccine fridge temperatures",
        "Escalate any cold chain excursion before use",
    ], roles=["PHARMACIST"], requires_verification=True),
    _row("Front shop opening", "opening", "front_shop", [
        "Check accessible aisles, signage and stock displays", "Prepare counters and till as authorised",
        "Confirm catalogue and promotions are correctly displayed",
    ], roles=["ASSISTANT", "TECHNICIAN"]),
    _row("Daily dispensary orders", "dispensary", "dispensary", [
        "Process supplier orders and prioritise urgent missing medicines",
        "Review special orders and delivery commitments", "Escalate supply and clinical issues",
    ]),
    _row("Owing and uncollected prescriptions", "dispensary", "dispensary", [
        "Investigate outstanding owing prescriptions", "Action overdue uncollected scripts per policy",
        "Record escalations and handover",
    ], roles=["PHARMACIST", "INTERN", "TECHNICIAN"]),
    _row("Medicare and PBS claim exceptions", "dispensary", "dispensary", [
        "Review rejected claims", "Investigate corrections and documentation",
        "Escalate outstanding discrepancies",
    ], roles=["PHARMACIST", "INTERN"], requires_verification=True),
    _row("DAA packing", "daa", "packing", [
        "Confirm changes since last pack", "Prepare packs using current authorised medicine list",
        "Separate prepared packs for independent authorised checking",
    ], roles=["TECHNICIAN", "ASSISTANT", "PHARMACIST"], requires_verification=True),
    _row("DAA final check", "daa", "packing", [
        "Conduct authorised final clinical and accuracy checks",
        "Resolve and document discrepancies", "Release only verified packs",
    ], roles=["PHARMACIST"], requires_verification=True),
    _row("Fridge evening check", "closing", "dispensary", [
        "Record current, minimum and maximum temperatures",
        "Action out of-range readings according to cold-chain procedure",
    ], roles=["PHARMACIST"], requires_verification=True),
    _row("Dispensary closing", "closing", "dispensary", [
        "Secure medicines and controlled-drug storage", "Action or hand over urgent prescriptions",
        "Reconcile end-of-day registers and incidents as applicable",
    ], roles=["PHARMACIST"], requires_verification=True),
    _row("Front shop closing", "closing", "front_shop", [
        "Replenish priority shelves", "Clean and secure counter area",
        "Close tills and banking according to access permissions",
    ], roles=["ASSISTANT", "TECHNICIAN"]),
    _row("Controlled drug register and balance", "safety", "dispensary", [
        "Complete required safe balance and register checks",
        "Escalate discrepancies immediately and document actions",
    ], roles=["PHARMACIST"], requires_verification=True),
    _row("Medicine recalls and incidents", "safety", "dispensary", [
        "Check current notices and action affected stock",
        "Document quarantine, investigation and required follow-up",
    ], roles=["PHARMACIST"], requires_verification=True, freq="WEEKLY", weekday=[0]),
    _row("Dispensary weekly compliance", "weekly", "dispensary", [
        "Check owing, missing and uncollected prescriptions",
        "Review fridge logs and exceptions", "Review incidents and follow-up actions",
    ], roles=["PHARMACIST"], freq="WEEKLY", weekday=[0], requires_verification=True),
    _row("Stock variance and expiry", "weekly", "stock", [
        "Walk floor to identify priority stock work", "Investigate stock variance and expiries",
        "Document adjusted inventory and pending decisions",
    ], freq="WEEKLY", weekday=[1]),
    _row("Pharmacy appearance and WHS", "weekly", "front_shop", [
        "Inspect customer areas and safety risks",
        "Document corrective actions and responsible person",
    ], freq="WEEKLY", weekday=[2]),
    _row("Weekly team handover and brief", "weekly", "general", [
        "Review progress against planned work", "Share key safety and service issues",
        "Agree owners of carry-over actions",
    ], freq="WEEKLY", weekday=[0]),
    _row("Professional services weekly review", "weekly", "clinical", [
        "Check clinically appropriate service bookings",
        "Review documentation, consent and service claim deadlines",
    ], roles=["PHARMACIST"], freq="WEEKLY", weekday=[4], requires_verification=True,
    target_kind="clinical"),
    _row("Month-start MSR", "monthly", "manager", [
        "Prepare monthly sales report using current reporting instructions",
        "Investigate anomalies and record sign-off",
    ], roles=["PHARMACIST"], freq="MONTHLY", requires_verification=True),
    _row("Month-start compliance pack", "monthly", "dispensary", [
        "Complete weekly dispensary checklist reconciliation",
        "Review cold-chain minimum and maximum report",
        "Review pharmacy appearance and WHS evidence",
        "Review controlled-drug declaration and incidents",
    ], roles=["PHARMACIST"], freq="FIRST_WEEKDAY_MONTH", requires_verification=True),
    _row("End-of-month stock and GP review", "monthly", "manager", [
        "Run stock variance report and investigate exceptions",
        "Review low or negative gross-profit lines",
        "Complete invoice and negative stock-on-hand reconciliation",
    ], freq="MONTHLY_28", requires_verification=True),
    _row("End-of-month PBS and PPA review", "monthly", "clinical", [
        "Review PBS rejections and owing scripts",
        "Review professional service documentation and claims",
        "Check funded-program caps and submission deadlines",
    ], roles=["PHARMACIST"], freq="MONTHLY_28", requires_verification=True),
    _row("Month-end banking and petty cash", "monthly", "manager", [
        "Investigate banking variances", "Reconcile authorised petty cash",
        "Prepare action list for next reporting period",
    ], freq="MONTHLY_28", requires_verification=True),
    _row("New staff induction", "training", "general", [
        "Review pharmacy policies and emergency procedures",
        "Complete role-appropriate onboarding modules",
        "Record learning acknowledgement and supervisor review",
    ], freq="ONCE", requires_verification=True),
    _row("Injection medicines training", "training", "clinical", [
        "Confirm learner eligibility and approved learning provider",
        "Record successful completion and credential evidence",
    ], roles=["PHARMACIST"], freq="ONCE", requires_verification=True),
    _row("Blood pressure service training", "training", "clinical", [
        "Complete approved practice instruction", "Demonstrate safe patient measurements",
        "Record approved competency and any supervision requirements",
    ], freq="ONCE", requires_verification=True),
    _row("Monthly team learning review", "training", "general", [
        "Review outstanding staff learning", "Schedule competency refreshers",
        "Document current credentials where required",
    ], freq="FIRST_WEEKDAY_MONTH", requires_verification=True),
    _row("Daily service focus", "clinical", "clinical", [
        "Confirm eligible appointments and available pharmacist coverage",
        "Record delivery of completed services without patient identifiers",
    ], roles=["PHARMACIST"], target_kind="clinical", target_value=1, target_unit="services"),
    _row("Daily customer service focus", "front_shop", "front_shop", [
        "Provide appropriate patient support and refer clinical questions",
        "Record agreed team activity without pressuring inappropriate sales",
    ], target_value=20, target_unit="contacts"),
]


def catalog():
    return [{**deepcopy(item), "catalog_id": str(i + 1)} for i, item in enumerate(STARTER_TEMPLATES)]
