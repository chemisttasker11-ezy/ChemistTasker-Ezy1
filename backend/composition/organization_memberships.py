"""Wire membership management to organisation HTTP adapters without I/O."""
from memberships import organization_management
from organizations.membership_port import MembershipOperations, configure_membership_operations


configure_membership_operations(MembershipOperations(
    link_owner=organization_management.link_owner,
    bootstrap_contact=organization_management.bootstrap_contact,
    pending_admin_invitations=organization_management.pending_admin_invitations,
    accept_admin_invitation=organization_management.accept_admin_invitation,
    reject_admin_invitation=organization_management.reject_admin_invitation,
    admin_queryset=organization_management.admin_queryset,
    create_admin=organization_management.create_admin,
    revoke_admin=organization_management.revoke_admin,
    chain_add_user=organization_management.chain_add_user,
    chain_remove_user=organization_management.chain_remove_user,
))
