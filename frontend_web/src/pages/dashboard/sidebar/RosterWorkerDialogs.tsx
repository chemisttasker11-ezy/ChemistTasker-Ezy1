import type { Dispatch, SetStateAction } from 'react';
import {
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Select,
  type SelectChangeEvent,
  Skeleton,
  TextField,
  Typography,
} from '@mui/material';
import moment from 'moment';
import {
  type Assignment,
  type Pharmacy,
  LEAVE_TYPES,
} from './RosterWorkerPage.model';

type Setter<T> = Dispatch<SetStateAction<T>>;
type SnackbarState = {
  open: boolean;
  message: string;
  severity: string;
};

type Props = {
  isActionDialogOpen: boolean;
  setIsActionDialogOpen: Setter<boolean>;
  pharmacies: Pharmacy[];
  selectedPharmacyId: number | null;
  selectedSlotDate: Date | null;
  selectedStart: Date | null;
  selectedEnd: Date | null;
  handleSelectedDateChange: (dateValue: string) => void;
  handleSelectedTimeChange: (field: 'start' | 'end', timeValue: string) => void;
  selectedAssignment: Assignment | null;
  currentUserId: number | null | undefined;
  setSnackbar: Setter<SnackbarState>;

  isEditingLeaveRequest: boolean;
  setIsEditingLeaveRequest: Setter<boolean>;
  leaveType: string;
  setLeaveType: Setter<string>;
  leaveNote: string;
  setLeaveNote: Setter<string>;
  isLeaveDialogOpen: boolean;
  setIsLeaveDialogOpen: Setter<boolean>;
  canModifyLeaveRequest: boolean;
  handleCancelLeaveRequest: () => void | Promise<void>;
  handleSubmitLeaveRequest: () => void | Promise<void>;

  isEditingSwapRequest: boolean;
  setIsEditingSwapRequest: Setter<boolean>;
  swapNote: string;
  setSwapNote: Setter<string>;
  isSwapDialogOpen: boolean;
  setIsSwapDialogOpen: Setter<boolean>;
  canModifySwapRequest: boolean;
  handleCancelSwapRequest: () => void | Promise<void>;
  handleSubmitSwapRequest: () => void | Promise<void>;

  isClaimShiftDialogOpen: boolean;
  setIsClaimShiftDialogOpen: Setter<boolean>;
  isSubmitting: boolean;
  handleClaimShift: () => void | Promise<void>;
};

export default function RosterWorkerDialogs({
  isActionDialogOpen,
  setIsActionDialogOpen,
  pharmacies,
  selectedPharmacyId,
  selectedSlotDate,
  selectedStart,
  selectedEnd,
  handleSelectedDateChange,
  handleSelectedTimeChange,
  selectedAssignment,
  currentUserId,
  setSnackbar,
  isEditingLeaveRequest,
  setIsEditingLeaveRequest,
  leaveType,
  setLeaveType,
  leaveNote,
  setLeaveNote,
  isLeaveDialogOpen,
  setIsLeaveDialogOpen,
  canModifyLeaveRequest,
  handleCancelLeaveRequest,
  handleSubmitLeaveRequest,
  isEditingSwapRequest,
  setIsEditingSwapRequest,
  swapNote,
  setSwapNote,
  isSwapDialogOpen,
  setIsSwapDialogOpen,
  canModifySwapRequest,
  handleCancelSwapRequest,
  handleSubmitSwapRequest,
  isClaimShiftDialogOpen,
  setIsClaimShiftDialogOpen,
  isSubmitting,
  handleClaimShift,
}: Props) {
  return (
    <>
{/* NEW: Action Choice Dialog */}
      <Dialog open={isActionDialogOpen} onClose={() => setIsActionDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Select Action</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <TextField
              label="Pharmacy"
              value={pharmacies.find(p => p.id === selectedPharmacyId)?.name || ''}
              fullWidth
              disabled
            />
            <TextField
              label="Date"
              type="date"
              value={selectedSlotDate ? moment(selectedSlotDate).format('YYYY-MM-DD') : ''}
              onChange={(event) => handleSelectedDateChange(event.target.value)}
              InputLabelProps={{ shrink: true }}
              fullWidth
            />
            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Start Time"
                type="time"
                value={selectedStart ? moment(selectedStart).format('HH:mm') : ''}
                onChange={(event) => handleSelectedTimeChange('start', event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
              <TextField
                label="End Time"
                type="time"
                value={selectedEnd ? moment(selectedEnd).format('HH:mm') : ''}
                onChange={(event) => handleSelectedTimeChange('end', event.target.value)}
                InputLabelProps={{ shrink: true }}
                fullWidth
              />
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={() => {
              if (!selectedAssignment || selectedAssignment.user !== currentUserId) {
                setSnackbar({ open: true, message: "You can only request leave for your own assigned slots.", severity: "warning" });
                return;
              }
              setIsActionDialogOpen(false);
              setIsEditingLeaveRequest(false);
              setLeaveType('');
              setLeaveNote('');
              setIsLeaveDialogOpen(true);
            }}
            variant="outlined"
          >
            Request Leave
          </Button>
          <Button
            onClick={() => {
              setIsActionDialogOpen(false);
              setIsEditingSwapRequest(false);
              setSwapNote('');
              setIsSwapDialogOpen(true);
            }}
            variant="contained"
          >
            Request Swap / Cover
          </Button>
        </DialogActions>
      </Dialog>
      {/* NEW: Claim Shift Dialog */}
      <Dialog open={isClaimShiftDialogOpen} onClose={() => setIsClaimShiftDialogOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Claim Open Shift</DialogTitle>
        <DialogContent dividers>
          <List dense>
            <ListItem><ListItemText primary="Pharmacy" secondary={pharmacies.find(p => p.id === selectedPharmacyId)?.name || '—'} /></ListItem>
            {selectedSlotDate && (
              <ListItem><ListItemText primary="Date" secondary={moment(selectedSlotDate).format('dddd, MMMM Do YYYY')} /></ListItem>
            )}
            {selectedStart && selectedEnd && (
              <ListItem><ListItemText primary="Time" secondary={`${moment(selectedStart).format("h:mm A")} - ${moment(selectedEnd).format("h:mm A")}`} /></ListItem>
            )}
            <ListItem><ListItemText primary="Role" secondary={selectedAssignment?.shift_detail.role_needed || '—'} /></ListItem>
          </List>
          <Typography variant="body2" color="text.secondary" sx={{mt: 2}}>By claiming this shift, you will be assigned to it directly.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setIsClaimShiftDialogOpen(false)} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleClaimShift} variant="contained" color="primary" disabled={isSubmitting}>
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : 'Claim Shift'}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Leave Request Dialog */}
      <Dialog
        open={isLeaveDialogOpen}
        onClose={() => {
          if (isSubmitting) return;
          setIsLeaveDialogOpen(false);
          setIsEditingLeaveRequest(false);
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{isEditingLeaveRequest ? "Manage Leave Request" : "Request Leave"}</DialogTitle>
        <DialogContent dividers>
          {selectedAssignment ? (
            <>
                <List dense>
                    <ListItem><ListItemText primary="Pharmacy" secondary={selectedAssignment.shift_detail.pharmacy_name} /></ListItem>
                    {selectedAssignment.origin?.label && (
                      <ListItem><ListItemText primary="Source" secondary={selectedAssignment.origin.label} /></ListItem>
                    )}
                    <ListItem><ListItemText primary="Date" secondary={moment(selectedAssignment.slot_date).format('dddd, MMMM Do YYYY')} /></ListItem>
                    <ListItem><ListItemText primary="Time" secondary={`${moment(selectedAssignment.slot_detail.start_time, "HH:mm:ss").format("h:mm A")} - ${moment(selectedAssignment.slot_detail.end_time, "HH:mm:ss").format("h:mm A")}`} /></ListItem>
                </List>
                {selectedAssignment.leave_request && (
                    <Typography variant="h6" color="primary" sx={{ my: 2, p: 1, borderRadius: 1, bgcolor: 'primary.lighter' }}>
                        Existing Request Status: {selectedAssignment.leave_request.status}
                    </Typography>
                )}
                <Box component="form" sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
                    <FormControl fullWidth required disabled={isEditingLeaveRequest && !canModifyLeaveRequest}>
                        <InputLabel>Leave Type</InputLabel>
                        <Select value={leaveType} onChange={(e: SelectChangeEvent) => setLeaveType(e.target.value)} label="Leave Type">
                            {LEAVE_TYPES.map(lt => (
                                <MenuItem key={lt.value} value={lt.value}>{lt.label}</MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    <TextField
                        label="Note (Optional)"
                        multiline
                        rows={3}
                        value={leaveNote}
                        onChange={(e) => setLeaveNote(e.target.value)}
                        fullWidth
                        disabled={isEditingLeaveRequest && !canModifyLeaveRequest}
                    />
                </Box>
            </>
          ) : <Skeleton variant="rectangular" height={200}/>}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setIsLeaveDialogOpen(false); setIsEditingLeaveRequest(false); }} disabled={isSubmitting}>Close</Button>
          {isEditingLeaveRequest && (
            <Button color="error" onClick={handleCancelLeaveRequest} disabled={isSubmitting || !canModifyLeaveRequest}>
              Cancel Request
            </Button>
          )}
          <Button
            onClick={handleSubmitLeaveRequest}
            variant="contained"
            color="primary"
            disabled={isSubmitting || (isEditingLeaveRequest && !canModifyLeaveRequest)}
          >
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : (isEditingLeaveRequest ? 'Save Changes' : 'Submit Request')}
          </Button>
        </DialogActions>
      </Dialog>
{/* NEW: Swap / Cover Request Dialog */}
<Dialog
  open={isSwapDialogOpen}
  onClose={() => {
    if (isSubmitting) return;
    setIsSwapDialogOpen(false);
    setIsEditingSwapRequest(false);
  }}
  fullWidth
  maxWidth="sm"
>
  <DialogTitle>{isEditingSwapRequest ? "Manage Swap / Cover Request" : "Request Swap / Cover"}</DialogTitle>
  <DialogContent dividers>
    <List dense>
      <ListItem><ListItemText primary="Pharmacy" secondary={pharmacies.find(p => p.id === selectedPharmacyId)?.name || 'Unknown'} /></ListItem>
      {selectedSlotDate && (
        <ListItem><ListItemText primary="Date" secondary={moment(selectedSlotDate).format('dddd, MMMM Do YYYY')} /></ListItem>
      )}
      {selectedStart && selectedEnd && (
        <ListItem><ListItemText primary="Time" secondary={`${moment(selectedStart).format("h:mm A")} - ${moment(selectedEnd).format("h:mm A")}`} /></ListItem>
      )}
    </List>
    {isEditingSwapRequest && selectedAssignment?.swap_request && (
      <Typography variant="h6" color="primary" sx={{ my: 2, p: 1, borderRadius: 1, bgcolor: 'primary.lighter' }}>
        Existing Request Status: {selectedAssignment.swap_request.status}
      </Typography>
    )}
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
      <TextField
        label="Note (optional)"
        multiline
        rows={3}
        value={swapNote}
        onChange={(e) => setSwapNote(e.target.value)}
        fullWidth
        disabled={isEditingSwapRequest && !canModifySwapRequest}
      />
    </Box>
  </DialogContent>
  <DialogActions>
    <Button onClick={() => { setIsSwapDialogOpen(false); setIsEditingSwapRequest(false); }} disabled={isSubmitting}>Close</Button>
    {isEditingSwapRequest && (
      <Button
        color="error"
        onClick={handleCancelSwapRequest}
        disabled={isSubmitting || !canModifySwapRequest}
      >
        Cancel Request
      </Button>
    )}
    <Button
      variant="contained"
      onClick={handleSubmitSwapRequest}
      disabled={isSubmitting || (isEditingSwapRequest && !canModifySwapRequest)}
    >
      {isSubmitting ? <CircularProgress size={24} /> : (isEditingSwapRequest ? 'Save Changes' : 'Submit Request')}
    </Button>
  </DialogActions>
</Dialog>
    </>
  );
}
