"""Bind membership-owned services before importing identity HTTP routes; no I/O."""
from memberships import identity_reads, account_management
from users.membership_port import MembershipServices, configure_membership_services


configure_membership_services(MembershipServices(
    accepted_for_user=identity_reads.accepted_for_user,
    directory_memberships=identity_reads.directory_memberships,
    convert_manager_account=account_management.convert_manager_account,
))
