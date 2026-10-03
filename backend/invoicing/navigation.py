"""Client navigation helpers owned by the invoicing domain.

These helpers only build client destinations. They do not make authorization
decisions; invoice permissions remain enforced by the backend API.
"""


def invoice_action_url(invoice, dashboard_role=None):
    if not invoice:
        return ""

    role = str(dashboard_role or "").lower()
    if role == "pharmacist":
        return f"/dashboard/pharmacist/invoice/{invoice.id}"
    if role == "otherstaff":
        return f"/dashboard/otherstaff/invoice/{invoice.id}"
    if role == "organization":
        return f"/dashboard/organization/invoice/{invoice.id}"
    if role == "owner":
        return f"/dashboard/owner/invoice/{invoice.id}"
    if role == "admin":
        pharmacy_id = getattr(invoice, "pharmacy_id", None)
        return f"/dashboard/admin/{pharmacy_id}/invoice/{invoice.id}" if pharmacy_id else ""
    return ""
