import type { Dispatch, SetStateAction } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  FormControlLabel,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Skeleton,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import moment from 'moment';
import type {
  RosterPharmacyMember,
  WorkerShiftRequest,
} from '@chemisttasker/shared-core';
import { BRAND_COLORS, BRAND_FONTS } from '../../../constants/brandTheme';
import PostShiftPage from './PostShiftPage';
import {
  getVisibilityLabel,
  LEAVE_TYPES_MAP,
  type AssignmentViewModel,
  type ShiftForEdit,
} from './RosterOwnerPage.model';

type Setter<T> = Dispatch<SetStateAction<T>>;

type DuplicateShiftData = {
  id?: string | number;
  roleNeeded: string;
  startTime: string;
  endTime: string;
  userId: number | null;
  userName: string;
  isOpenShift: boolean;
};

type AddAssignmentDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  isDialogDataLoading: boolean;
  dialogShiftDate: string | null;
  setDialogShiftDate: Setter<string | null>;
  dialogShiftStartTime: string | null;
  setDialogShiftStartTime: Setter<string | null>;
  dialogShiftEndTime: string | null;
  setDialogShiftEndTime: Setter<string | null>;
  newShiftRoleNeeded: string;
  handleNewShiftRoleChange: (event: SelectChangeEvent<string>) => void;
  postAsOpenShift: boolean;
  setPostAsOpenShift: Setter<boolean>;
  openShiftVisibility: string;
  setOpenShiftVisibility: Setter<string>;
  selectedUserForAssignment: number | null;
  setSelectedUserForAssignment: Setter<number | null>;
  filteredMembers: RosterPharmacyMember[];
  isCreatingShift: boolean;
  handleCreateOpenShift: () => void;
  handleCreateShiftAndAssign: () => void | Promise<void>;
};

type AssignmentOptionsDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  selectedAssignment: AssignmentViewModel | null;
  isActionLoading: boolean;
  setIsEditDialogOpen: Setter<boolean>;
  setShiftToEdit: Setter<ShiftForEdit | null>;
  setEditIsOpenShift: Setter<boolean>;
  setEditOpenShiftVisibility: Setter<string>;
  openShiftVisibility: string;
  setSelectedUserForAssignment: Setter<number | null>;
  handleOpenDuplicateDialog: (eventOrAssignment: any) => void;
  selectableEscalationLevels: string[];
  showSnackbar: (message: string) => void;
  setEscalationLevel: Setter<string>;
  setIsEscalateDialogOpen: Setter<boolean>;
  handleDeleteAssignment: () => void | Promise<void>;
};

type DuplicateDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  isActionLoading: boolean;
  duplicateShiftData: DuplicateShiftData | null;
  calendarDate: Date;
  duplicateTargetDates: string[];
  setDuplicateTargetDates: Setter<string[]>;
  duplicateCustomDate: string;
  setDuplicateCustomDate: Setter<string>;
  duplicateKeepUser: boolean;
  setDuplicateKeepUser: Setter<boolean>;
  handleExecuteDuplicateShift: () => void | Promise<void>;
};

type LeaveDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  selectedAssignment: AssignmentViewModel | null;
  isActionLoading: boolean;
  handleRejectLeave: () => void | Promise<void>;
  handleApproveLeave: () => void | Promise<void>;
};

type CoverDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  selectedCoverRequest: WorkerShiftRequest | null;
  isActionLoading: boolean;
  handleRejectCoverRequest: () => void | Promise<void>;
  handleApproveCoverRequest: () => void | Promise<void>;
};

type EditDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  shiftToEdit: ShiftForEdit | null;
  setShiftToEdit: Setter<ShiftForEdit | null>;
  editIsOpenShift: boolean;
  setEditIsOpenShift: Setter<boolean>;
  editOpenShiftVisibility: string;
  setEditOpenShiftVisibility: Setter<string>;
  selectedUserForAssignment: number | null;
  setSelectedUserForAssignment: Setter<number | null>;
  filteredMembers: RosterPharmacyMember[];
  isActionLoading: boolean;
  handleSaveChanges: () => void | Promise<void>;
};

type EscalationDialogProps = {
  open: boolean;
  setOpen: Setter<boolean>;
  escalationLevel: string;
  setEscalationLevel: Setter<string>;
  selectableEscalationLevels: string[];
  isActionLoading: boolean;
  handleConfirmEscalation: () => void | Promise<void>;
};

type PostShiftDialogProps = {
  open: boolean;
  handleClosePostShiftModal: () => void;
  handlePostShiftCompleted: () => void;
};

type Props = {
  addAssignment: AddAssignmentDialogProps;
  assignmentOptions: AssignmentOptionsDialogProps;
  duplicate: DuplicateDialogProps;
  leave: LeaveDialogProps;
  cover: CoverDialogProps;
  edit: EditDialogProps;
  escalation: EscalationDialogProps;
  postShift: PostShiftDialogProps;
};

export default function RosterOwnerDialogs({
  addAssignment,
  assignmentOptions,
  duplicate,
  leave,
  cover,
  edit,
  escalation,
  postShift,
}: Props) {
  const {
    open: isAddAssignmentDialogOpen,
    setOpen: setIsAddAssignmentDialogOpen,
    isDialogDataLoading,
    dialogShiftDate,
    setDialogShiftDate,
    dialogShiftStartTime,
    setDialogShiftStartTime,
    dialogShiftEndTime,
    setDialogShiftEndTime,
    newShiftRoleNeeded,
    handleNewShiftRoleChange,
    postAsOpenShift,
    setPostAsOpenShift,
    openShiftVisibility,
    setOpenShiftVisibility,
    selectedUserForAssignment,
    setSelectedUserForAssignment,
    filteredMembers,
    isCreatingShift,
    handleCreateOpenShift,
    handleCreateShiftAndAssign,
  } = addAssignment;

  const {
    open: isOptionsDialogOpen,
    setOpen: setIsOptionsDialogOpen,
    selectedAssignment,
    isActionLoading,
    setIsEditDialogOpen,
    setShiftToEdit,
    setEditIsOpenShift,
    setEditOpenShiftVisibility,
    handleOpenDuplicateDialog,
    selectableEscalationLevels,
    showSnackbar,
    setEscalationLevel,
    setIsEscalateDialogOpen,
    handleDeleteAssignment,
  } = assignmentOptions;

  const {
    open: isDuplicateDialogOpen,
    setOpen: setIsDuplicateDialogOpen,
    duplicateShiftData,
    calendarDate,
    duplicateTargetDates,
    setDuplicateTargetDates,
    duplicateCustomDate,
    setDuplicateCustomDate,
    duplicateKeepUser,
    setDuplicateKeepUser,
    handleExecuteDuplicateShift,
  } = duplicate;

  const {
    open: isLeaveManageDialogOpen,
    setOpen: setIsLeaveManageDialogOpen,
    handleRejectLeave,
    handleApproveLeave,
  } = leave;

  const {
    open: isCoverRequestDialogOpen,
    setOpen: setIsCoverRequestDialogOpen,
    selectedCoverRequest,
    handleRejectCoverRequest,
    handleApproveCoverRequest,
  } = cover;

  const {
    open: isEditDialogOpen,
    shiftToEdit,
    editIsOpenShift,
    editOpenShiftVisibility,
    handleSaveChanges,
  } = edit;

  const {
    open: isEscalateDialogOpen,
    escalationLevel,
    handleConfirmEscalation,
  } = escalation;

  const {
    open: isPostShiftModalOpen,
    handleClosePostShiftModal,
    handlePostShiftCompleted,
  } = postShift;

  return (
    <>
{/* DIALOGS */}
      {/* Add Assignment / Open Shift Dialog */}
      <Dialog open={isAddAssignmentDialogOpen} onClose={() => setIsAddAssignmentDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Create New Shift and Assign</DialogTitle>
        <DialogContent dividers>
          {isDialogDataLoading ? ( <Skeleton variant="rectangular" height={150} /> ) : (
            <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField label="Date" type="date" value={dialogShiftDate || ''} InputLabelProps={{ shrink: true }} onChange={(e) => setDialogShiftDate(e.target.value)} required fullWidth/>
              <Box sx={{ display: 'flex', gap: 2 }}>
                <TextField label="Start Time" type="time" value={dialogShiftStartTime || ''} InputLabelProps={{ shrink: true }} onChange={(e) => setDialogShiftStartTime(e.target.value)} required fullWidth/>
                <TextField label="End Time" type="time" value={dialogShiftEndTime || ''} InputLabelProps={{ shrink: true }} onChange={(e) => setDialogShiftEndTime(e.target.value)} required fullWidth/>
              </Box>
              <FormControl fullWidth required>
                <InputLabel>Role Needed</InputLabel>
                <Select value={newShiftRoleNeeded} onChange={handleNewShiftRoleChange} label="Role Needed">
                  <MenuItem value="PHARMACIST">Pharmacist</MenuItem>
                  <MenuItem value="INTERN">Intern</MenuItem>
                  <MenuItem value="TECHNICIAN">Technician</MenuItem>
                  <MenuItem value="ASSISTANT">Assistant</MenuItem>
                </Select>
              </FormControl>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={postAsOpenShift}
                    onChange={(e) => {
                      setPostAsOpenShift(e.target.checked);
                      if (e.target.checked) {
                        setOpenShiftVisibility('LOCUM_CASUAL');
                      }
                    }}
                  />
                }
                label="Post as an Open Shift for the community to claim"
              />

              {postAsOpenShift && (
                <FormControl fullWidth required>
                  <InputLabel>Initial visibility</InputLabel>
                  <Select
                    value={openShiftVisibility}
                    onChange={(e) => setOpenShiftVisibility(e.target.value as string)}
                    label="Initial visibility"
                  >
                    <MenuItem value="FULL_PART_TIME">Full/Part Time</MenuItem>
                    <MenuItem value="LOCUM_CASUAL">Locum/Casual</MenuItem>
                    <MenuItem value="OWNER_CHAIN">Owner Chain</MenuItem>
                    <MenuItem value="ORG_CHAIN">Organization Chain</MenuItem>
                    <MenuItem value="PLATFORM">ChemistTasker (Public)</MenuItem>
                  </Select>
                </FormControl>
              )}

              <FormControl fullWidth required disabled={postAsOpenShift}>
                <InputLabel>Assign Staff Member</InputLabel>
                <Select value={selectedUserForAssignment || ''} onChange={(e) => setSelectedUserForAssignment(e.target.value as number)} label="Assign Staff Member" disabled={!newShiftRoleNeeded || postAsOpenShift}>
              {filteredMembers.length === 0 ? (
                <MenuItem disabled value="">{newShiftRoleNeeded ? "No staff for this role" : "Select a role first"}</MenuItem>
              ) : (
                filteredMembers.map(member => {
                  const displayName = (member.userDetails?.firstName || member.userDetails?.lastName) ? `${member.userDetails?.firstName || ''} ${member.userDetails?.lastName || ''}`.trim() : member.invitedName;
                  const employmentLabel = member.employmentType || 'N/A';
                  return (<MenuItem key={member.id} value={member.user}>{displayName} ({employmentLabel})</MenuItem>);
                })
              )}
                </Select>
              </FormControl>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsAddAssignmentDialogOpen(false)} disabled={isCreatingShift}>Cancel</Button>
          <Button
            onClick={postAsOpenShift ? handleCreateOpenShift : handleCreateShiftAndAssign}
            variant="contained"
            color="primary"
            disabled={isCreatingShift}
          >
            {isCreatingShift ? <CircularProgress size={24} color="inherit" /> : (postAsOpenShift ? 'Post Open Shift' : 'Create & Assign')}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Existing Options Dialog (Unchanged) */}
      <Dialog open={isOptionsDialogOpen} onClose={() => setIsOptionsDialogOpen(false)}>
        <DialogTitle>Manage Assignment</DialogTitle>
        <DialogContent>
            {selectedAssignment && <List>
                <ListItem><ListItemText primary="Staff" secondary={
                  selectedAssignment.isOpenShift ? 'Open Shift' : `${selectedAssignment.userDetail.firstName} ${selectedAssignment.userDetail.lastName}`
                } /></ListItem>
                <ListItem><ListItemText primary="Source" secondary={
                  selectedAssignment.origin?.label || getVisibilityLabel(selectedAssignment.shiftDetail?.visibility)
                } /></ListItem>
                <ListItem><ListItemText primary="Date & Time" secondary={`${selectedAssignment.slotDate} @ ${moment(selectedAssignment.slotDetail?.startTime ?? '00:00', ["HH:mm:ss","HH:mm"]).format("h:mm A")}`} /></ListItem>
                {selectedAssignment.leaveRequest?.status === 'APPROVED' &&
                  <ListItem><Chip label="LEAVE APPROVED" color="error" size="small" /></ListItem>
                }
            </List>}
        </DialogContent>
        <DialogActions sx={{ flexDirection: 'column', alignItems: 'stretch', p: 2, gap: 1}}>
            <Button
              variant="outlined"
              disabled={isActionLoading}
              onClick={() => {
                if (!selectedAssignment) return;
                setIsOptionsDialogOpen(false);
                setIsEditDialogOpen(true);
                setShiftToEdit({
                  id: selectedAssignment.shift ?? selectedAssignment.id,
                  roleNeeded: selectedAssignment.shiftDetail?.roleNeeded,
                  slots: selectedAssignment.slotDetail ? [selectedAssignment.slotDetail] : [],
                });
                setEditIsOpenShift(Boolean(selectedAssignment.isOpenShift));
                setEditOpenShiftVisibility(selectedAssignment.shiftDetail?.visibility ?? openShiftVisibility);
                setSelectedUserForAssignment(selectedAssignment.user ?? null);
              }}
            >
              Edit Shift / Re-Assign
            </Button>
            <Button
              variant="outlined"
              disabled={isActionLoading}
              startIcon={<ContentCopyIcon />}
              onClick={() => {
                if (!selectedAssignment) return;
                setIsOptionsDialogOpen(false);
                handleOpenDuplicateDialog(selectedAssignment);
              }}
              sx={{
                borderColor: BRAND_COLORS.purple,
                color: BRAND_COLORS.purple,
                fontWeight: 600,
                '&:hover': {
                  bgcolor: BRAND_COLORS.purpleLight,
                  borderColor: BRAND_COLORS.purpleHover,
                },
              }}
            >
              Duplicate Shift Slot...
            </Button>
            <Button
              variant="outlined"
              disabled={isActionLoading || !selectableEscalationLevels.length}
              color="secondary"
              onClick={() => {
                if (!selectedAssignment) {
                  return;
                }
                if (!selectableEscalationLevels.length) {
                  showSnackbar('No higher visibility levels available to escalate to.');
                  return;
                }
                setIsOptionsDialogOpen(false);
                setEscalationLevel(selectableEscalationLevels[0] ?? '');
                setIsEscalateDialogOpen(true);
              }}
            >
              Escalate Shift
            </Button>
            <Button variant="contained" disabled={isActionLoading} color="error" onClick={handleDeleteAssignment}>
                {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Delete Assignment'}
            </Button>
            <Button onClick={() => setIsOptionsDialogOpen(false)} sx={{mt: 1}} disabled={isActionLoading}>Cancel</Button>
        </DialogActions>
      </Dialog>

      {/* Duplicate Shift Dialog */}
      <Dialog
        open={isDuplicateDialogOpen}
        onClose={() => !isActionLoading && setIsDuplicateDialogOpen(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle sx={{ fontFamily: BRAND_FONTS.heading, fontWeight: 700, color: BRAND_COLORS.navy, display: 'flex', alignItems: 'center', gap: 1 }}>
          <ContentCopyIcon sx={{ color: BRAND_COLORS.purple }} />
          Duplicate Shift Slot
        </DialogTitle>
        <DialogContent dividers>
          {duplicateShiftData && (
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, py: 1 }}>
              {/* Shift Overview Card */}
              <Paper
                variant="outlined"
                sx={{
                  p: 2,
                  bgcolor: BRAND_COLORS.mist,
                  borderColor: BRAND_COLORS.border,
                  borderRadius: '10px',
                }}
              >
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND_COLORS.navy, mb: 0.5 }}>
                  Shift to Duplicate
                </Typography>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip
                    label={duplicateShiftData.roleNeeded || 'Staff'}
                    size="small"
                    sx={{
                      bgcolor: BRAND_COLORS.purpleLight,
                      color: BRAND_COLORS.purple,
                      fontWeight: 700,
                      borderRadius: '4px',
                    }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600, color: BRAND_COLORS.navy }}>
                    {duplicateShiftData.startTime} – {duplicateShiftData.endTime}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    • Assigned to: <strong>{duplicateShiftData.userName}</strong>
                  </Typography>
                </Stack>
              </Paper>

              {/* Target Days Selection */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: BRAND_COLORS.navy, mb: 1 }}>
                  Select Target Date(s) within Active Week:
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                  {(() => {
                    const weekMon = moment(calendarDate).startOf('isoWeek');
                    const weekDays = [];
                    for (let i = 0; i < 7; i++) {
                      const d = moment(weekMon).add(i, 'days');
                      const dStr = d.format('YYYY-MM-DD');
                      const isSelected = duplicateTargetDates.includes(dStr);
                      weekDays.push(
                        <Button
                          key={dStr}
                          variant={isSelected ? 'contained' : 'outlined'}
                          size="small"
                          onClick={() => {
                            setDuplicateTargetDates((prev) =>
                              prev.includes(dStr) ? prev.filter((x) => x !== dStr) : [...prev, dStr]
                            );
                          }}
                          sx={{
                            borderRadius: '8px',
                            textTransform: 'none',
                            fontWeight: 600,
                            fontSize: 12,
                            px: 1.5,
                            py: 0.75,
                            bgcolor: isSelected ? BRAND_COLORS.purple : 'white',
                            color: isSelected ? 'white' : BRAND_COLORS.navy,
                            borderColor: isSelected ? BRAND_COLORS.purple : BRAND_COLORS.border,
                            '&:hover': {
                              bgcolor: isSelected ? BRAND_COLORS.purpleHover : BRAND_COLORS.mist,
                            },
                          }}
                        >
                          {d.format('ddd D MMM')}
                        </Button>
                      );
                    }
                    return weekDays;
                  })()}
                </Box>
              </Box>

              {/* Or Select Another Date (Fortnight / Any Date) */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: BRAND_COLORS.navy, mb: 0.75 }}>
                  Or pick any date (e.g. next week / fortnight):
                </Typography>
                <TextField
                  type="date"
                  size="small"
                  fullWidth
                  value={duplicateCustomDate}
                  onChange={(e) => setDuplicateCustomDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Box>

              {/* Worker Preservation Checkbox */}
              {!duplicateShiftData.isOpenShift && duplicateShiftData.userId && (
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={duplicateKeepUser}
                      onChange={(e) => setDuplicateKeepUser(e.target.checked)}
                      sx={{ color: BRAND_COLORS.purple, '&.Mui-checked': { color: BRAND_COLORS.purple } }}
                    />
                  }
                  label={
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      Keep assigned to <strong>{duplicateShiftData.userName}</strong> (uncheck to create as open shift)
                    </Typography>
                  }
                />
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setIsDuplicateDialogOpen(false)} disabled={isActionLoading}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleExecuteDuplicateShift}
            disabled={
              isActionLoading ||
              (duplicateTargetDates.length === 0 && !duplicateCustomDate)
            }
            sx={{
              bgcolor: BRAND_COLORS.purple,
              color: 'white',
              fontWeight: 700,
              textTransform: 'none',
              px: 2.5,
              '&:hover': {
                bgcolor: BRAND_COLORS.purpleHover,
              },
            }}
          >
            {isActionLoading ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              `Duplicate to ${duplicateTargetDates.length + (duplicateCustomDate && !duplicateTargetDates.includes(duplicateCustomDate) ? 1 : 0)} Date(s)`
            )}
          </Button>
        </DialogActions>
      </Dialog>

      {/* NEW: Leave Management Dialog */}
      <Dialog open={isLeaveManageDialogOpen} onClose={() => setIsLeaveManageDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Leave Request</DialogTitle>
        <DialogContent dividers>
            {selectedAssignment && selectedAssignment.leaveRequest ? (
                <Box sx={{pt: 1}}>
                    <List dense>
                        <ListItem><ListItemText primary="Staff Member" secondary={`${selectedAssignment.userDetail.firstName} ${selectedAssignment.userDetail.lastName}`} /></ListItem>
                        <ListItem><ListItemText primary="Shift Date" secondary={moment(selectedAssignment.slotDate).format('dddd, MMMM Do YYYY')} /></ListItem>
                        <ListItem><ListItemText primary="Leave Type" secondary={LEAVE_TYPES_MAP[selectedAssignment.leaveRequest.leaveType] || selectedAssignment.leaveRequest.leaveType} /></ListItem>
                    </List>
                    <Typography variant="subtitle2" sx={{ mt: 2, color: 'text.secondary' }}>Team Member's Note:</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: '60px', bgcolor: 'grey.100' }}>
                        <Typography variant="body2" sx={{ fontStyle: selectedAssignment.leaveRequest.note ? 'normal' : 'italic', color: selectedAssignment.leaveRequest.note ? 'text.primary' : 'text.secondary' }}>
                            {selectedAssignment.leaveRequest.note || "No note provided."}
                        </Typography>
                    </Paper>
                </Box>
            ) : <Skeleton variant="rectangular" height={200} />}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setIsLeaveManageDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleRejectLeave} variant="outlined" color="error" disabled={isActionLoading}>
              {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Reject Request'}
            </Button>
            <Button onClick={handleApproveLeave} variant="contained" color="success" disabled={isActionLoading}>
              {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Approve Leave'}
            </Button>
        </DialogActions>
      </Dialog>

      {/* NEW: Cover/Swap Request Management Dialog */}
      <Dialog open={isCoverRequestDialogOpen} onClose={() => setIsCoverRequestDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Manage Cover Request</DialogTitle>
        <DialogContent dividers>
            {selectedCoverRequest ? (
                <Box sx={{pt: 1}}>
                    <List dense>
                        <ListItem><ListItemText primary="Staff Member" secondary={selectedCoverRequest.requesterName || 'Unknown'} /></ListItem>
                        <ListItem><ListItemText primary="Shift Date" secondary={moment(selectedCoverRequest.slotDate).format('dddd, MMMM Do YYYY')} /></ListItem>
                        <ListItem><ListItemText primary="Time" secondary={`${moment(selectedCoverRequest.startTime, "HH:mm:ss").format("h:mm A")} - ${moment(selectedCoverRequest.endTime, "HH:mm:ss").format("h:mm A")}`} /></ListItem>
                        <ListItem><ListItemText primary="Role" secondary={selectedCoverRequest.role} /></ListItem>
                    </List>
                    <Typography variant="subtitle2" sx={{ mt: 2, color: 'text.secondary' }}>Team Member's Note:</Typography>
                    <Paper variant="outlined" sx={{ p: 2, mt: 1, minHeight: '60px', bgcolor: 'grey.100' }}>
                        <Typography variant="body2" sx={{ fontStyle: selectedCoverRequest.note ? 'normal' : 'italic', color: selectedCoverRequest.note ? 'text.primary' : 'text.secondary' }}>
                            {selectedCoverRequest.note || "No note provided."}
                        </Typography>
                    </Paper>
                </Box>
            ) : <Skeleton variant="rectangular" height={200} />}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setIsCoverRequestDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
            <Button onClick={handleRejectCoverRequest} variant="outlined" color="error" disabled={isActionLoading}>
              {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Reject Request'}
            </Button>
            <Button onClick={handleApproveCoverRequest} variant="contained" color="success" disabled={isActionLoading}>
              {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Approve Request'}
            </Button>
        </DialogActions>
      </Dialog>

      {/* Edit Dialog (Unchanged) */}
      <Dialog open={isEditDialogOpen} onClose={() => setIsEditDialogOpen(false)} fullWidth maxWidth="sm">
          <DialogTitle>Edit Shift</DialogTitle>
          <DialogContent dividers>
              {shiftToEdit && <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
                  <TextField label="Date" type="date" value={moment(shiftToEdit.slots[0].date).format('YYYY-MM-DD')} onChange={e => setShiftToEdit(s => s && ({ ...s, slots: [{ ...s.slots[0], date: e.target.value }] }))} InputLabelProps={{ shrink: true }} fullWidth />
                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <TextField label="Start Time" type="time" value={(shiftToEdit.slots[0].startTime || '').toString().slice(0,5)} onChange={e => setShiftToEdit(s => s && ({ ...s, slots: [{ ...s.slots[0], startTime: e.target.value }] }))} InputLabelProps={{ shrink: true }} fullWidth />
                    <TextField label="End Time" type="time" value={(shiftToEdit.slots[0].endTime || '').toString().slice(0,5)} onChange={e => setShiftToEdit(s => s && ({ ...s, slots: [{ ...s.slots[0], endTime: e.target.value }] }))} InputLabelProps={{ shrink: true }} fullWidth />
                  </Box>
                  <FormControl fullWidth>
                      <InputLabel>Role Needed</InputLabel>
                      <Select value={shiftToEdit.roleNeeded ?? ''} label="Role Needed" onChange={e => setShiftToEdit(s => s && ({...s, roleNeeded: e.target.value}))}>
                          <MenuItem value="PHARMACIST">Pharmacist</MenuItem>
                          <MenuItem value="INTERN">Intern</MenuItem>
                          <MenuItem value="TECHNICIAN">Technician</MenuItem>
                          <MenuItem value="ASSISTANT">Assistant</MenuItem>
                      </Select>
                  </FormControl>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={editIsOpenShift}
                        onChange={(e) => setEditIsOpenShift(e.target.checked)}
                      />
                    }
                    label="Post as an Open Shift for the community to claim"
                  />
                  {editIsOpenShift && (
                    <FormControl fullWidth required>
                      <InputLabel>Initial visibility</InputLabel>
                      <Select
                        value={editOpenShiftVisibility}
                        onChange={(e) => setEditOpenShiftVisibility(e.target.value as string)}
                        label="Initial visibility"
                      >
                        <MenuItem value="FULL_PART_TIME">Full/Part Time</MenuItem>
                        <MenuItem value="LOCUM_CASUAL">Locum/Casual</MenuItem>
                        <MenuItem value="OWNER_CHAIN">Owner Chain</MenuItem>
                        <MenuItem value="ORG_CHAIN">Organization Chain</MenuItem>
                        <MenuItem value="PLATFORM">ChemistTasker (Public)</MenuItem>
                      </Select>
                    </FormControl>
                  )}
                  <FormControl fullWidth>
                    <InputLabel>Assign Staff Member</InputLabel>
                    <Select value={selectedUserForAssignment || ''} onChange={(e) => setSelectedUserForAssignment(e.target.value as number)} label="Assign Staff Member" disabled={!shiftToEdit.roleNeeded || editIsOpenShift}>
                      {filteredMembers.length === 0 ? (
                        <MenuItem disabled value="">{shiftToEdit.roleNeeded ? "No staff for this role" : "Select a role first"}</MenuItem>
                      ) : (
                        filteredMembers.map(member => {
                          const displayName = (member.userDetails?.firstName || member.userDetails?.lastName) ? `${member.userDetails?.firstName || ''} ${member.userDetails?.lastName || ''}`.trim() : member.invitedName;
                          const employmentLabel = member.employmentType || 'N/A';
                          return (<MenuItem key={member.id} value={member.user}>{displayName} ({employmentLabel})</MenuItem>);
                        })
                      )}
                    </Select>
                  </FormControl>
              </Box>}
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setIsEditDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
              <Button onClick={handleSaveChanges} variant="contained" disabled={isActionLoading}>
                {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Save Changes'}
              </Button>
          </DialogActions>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog
        open={isEscalateDialogOpen}
        onClose={() => {
          setIsEscalateDialogOpen(false);
          setEscalationLevel('');
        }}
        fullWidth
        maxWidth="xs"
      >
          <DialogTitle>Escalate Shift Visibility</DialogTitle>
          <DialogContent>
              <FormControl fullWidth sx={{mt: 1}}>
                  <InputLabel>New Visibility Level</InputLabel>
                  <Select
                    value={escalationLevel}
                    label="New Visibility Level"
                    onChange={e => setEscalationLevel(e.target.value)}
                    disabled={!selectableEscalationLevels.length}
                  >
                      {selectableEscalationLevels.length === 0 ? (
                        <MenuItem value="" disabled>No higher levels available</MenuItem>
                      ) : (
                        selectableEscalationLevels.map(level => (
                          <MenuItem key={level} value={level}>
                            {level.replace(/_/g, ' ')}
                          </MenuItem>
                        ))
                      )}
                  </Select>
              </FormControl>
          </DialogContent>
          <DialogActions>
              <Button onClick={() => setIsEscalateDialogOpen(false)} disabled={isActionLoading}>Cancel</Button>
              <Button onClick={handleConfirmEscalation} variant="contained" disabled={isActionLoading || !escalationLevel}>
                {isActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Confirm & Unassign'}
              </Button>
          </DialogActions>
      </Dialog>

      {/* Full Post Shift wizard overlay */}
      <Dialog
        open={isPostShiftModalOpen}
        onClose={handleClosePostShiftModal}
        fullWidth
        maxWidth="xl"
        PaperProps={{
          sx: {
            width: '95vw',
            height: '95vh',
            m: 0,
            borderRadius: 3,
            overflow: 'hidden',
          }
        }}
      >
        <Box sx={{ height: '100%', overflow: 'auto', bgcolor: 'background.default' }}>
          <PostShiftPage onCompleted={handlePostShiftCompleted} />
        </Box>
      </Dialog>
    </>
  );
}
