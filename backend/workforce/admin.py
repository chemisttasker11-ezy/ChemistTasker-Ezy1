from django.contrib import admin

from .models import (
    CoverageRequirement,
    MembershipWorkSettings,
    RosterOperation,
    RosterRevisionState,
    Timesheet,
    TimesheetApproval,
    TimesheetCheck,
    TimesheetCheckDecision,
    TimesheetComment,
    TimesheetManifest,
    TimesheetPeriod,
    TimesheetRevision,
    TimesheetSegment,
    WorkforceLeaveRequest,
)

for model in [
    CoverageRequirement, MembershipWorkSettings, RosterOperation, RosterRevisionState,
    Timesheet, TimesheetApproval, TimesheetCheck, TimesheetCheckDecision,
    TimesheetComment, TimesheetManifest, TimesheetPeriod, TimesheetRevision,
    TimesheetSegment, WorkforceLeaveRequest,
]:
    admin.site.register(model)
