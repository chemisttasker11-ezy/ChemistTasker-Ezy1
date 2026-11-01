"""Bind membership-owned identity services at application startup; no I/O."""
from memberships import identity_reads, account_management
from users.membership_port import MembershipServices, configure_membership_services


def configure_identity_memberships():
    configure_membership_services(MembershipServices(
        accepted_for_user=identity_reads.accepted_for_user,
        directory_memberships=identity_reads.directory_memberships,
        convert_manager_account=account_management.convert_manager_account,
    ))
