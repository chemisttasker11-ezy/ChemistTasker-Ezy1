import React, { useState, useEffect, useCallback } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  Tab,
  Tabs,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import PublishIcon from '@mui/icons-material/Publish';
import UndoIcon from '@mui/icons-material/Undo';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import BookmarkAddIcon from '@mui/icons-material/BookmarkAdd';
import HowToRegIcon from '@mui/icons-material/HowToReg';
import CloseIcon from '@mui/icons-material/Close';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import moment from 'moment';
import apiClient from '../../utils/apiClient';

export interface RosterPlanningToolbarProps {
  pharmacyId: number | null;
  calendarDate: Date;
  onRosterUpdated?: () => void;
  onNavigateWeek?: (targetDate: Date) => void;
}

interface RosterPeriodData {
  period_id: number;
  week_start: string;
  week_end: string;
  status: 'DRAFT' | 'PUBLISHED';
  published_at: string | null;
  published_by: string | null;
  total_assignments: number;
}

interface ValidationResult {
  is_valid: boolean;
  errors: Array<{ type: string; message: string }>;
  warnings: Array<{ type: string; message: string }>;
  total_assignments: number;
  total_workers: number;
}

interface AcknowledgementWorker {
  id: number;
  name: string;
  role: string;
  shift_count: number;
  is_acknowledged: boolean;
  acknowledged_at: string | null;
  notes: string;
}

interface AcknowledgementData {
  period_id: number;
  week_start: string;
  status: string;
  total_workers: number;
  acknowledged_count: number;
  pending_count: number;
  workers: AcknowledgementWorker[];
}

interface RosterTemplateItem {
  id: number;
  name: string;
  pharmacy_id: number;
  template_data: any[];
  total_slots: number;
  created_at: string;
}

export default function RosterPlanningToolbar({
  pharmacyId,
  calendarDate,
  onRosterUpdated,
  onNavigateWeek,
}: RosterPlanningToolbarProps) {
  const [period, setPeriod] = useState<RosterPeriodData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Dialog States
  const [validationDialogOpen, setValidationDialogOpen] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);

  const [ackDialogOpen, setAckDialogOpen] = useState(false);
  const [ackData, setAckData] = useState<AcknowledgementData | null>(null);

  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [targetWeekDate, setTargetWeekDate] = useState<string>('');
  const [copyIncludeAssignments, setCopyIncludeAssignments] = useState(true);
  const [copyOverwrite, setCopyOverwrite] = useState(false);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [templateTab, setTemplateTab] = useState<'save' | 'apply'>('save');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [templateIncludeUsers, setTemplateIncludeUsers] = useState(true);
  const [savedTemplates, setSavedTemplates] = useState<RosterTemplateItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateOverwrite, setTemplateOverwrite] = useState(false);

  const monday = moment(calendarDate).startOf('isoWeek');
  const sunday = moment(calendarDate).endOf('isoWeek');
  const mondayStr = monday.format('YYYY-MM-DD');

  // Next Monday default for copy
  const nextMondayStr = moment(calendarDate).add(1, 'week').startOf('isoWeek').format('YYYY-MM-DD');

  // Load period data for the week
  const fetchPeriodData = useCallback(async () => {
    if (!pharmacyId) {
      setPeriod(null);
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiClient.get(
        `/client-profile/attendance/roster/period/?pharmacy_id=${pharmacyId}&week_start=${mondayStr}`
      );
      setPeriod(res.data);
    } catch (err: any) {
      console.error('Failed to fetch roster period details', err);
    } finally {
      setIsLoading(false);
    }
  }, [pharmacyId, mondayStr]);

  useEffect(() => {
    fetchPeriodData();
    setTargetWeekDate(nextMondayStr);
  }, [fetchPeriodData, nextMondayStr]);

  // 1. Run Pre-Publish Validation
  const handleValidate = async () => {
    if (!period) return;
    setActionLoading(true);
    try {
      const res = await apiClient.post('/client-profile/attendance/roster/validate/', {
        period_id: period.period_id,
      });
      setValidationResult(res.data);
      setValidationDialogOpen(true);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Validation failed.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 2. Publish Roster
  const handlePublish = async (forceWarnings = true) => {
    if (!period) return;
    setActionLoading(true);
    try {
      const res = await apiClient.post('/client-profile/attendance/roster/publish/', {
        period_id: period.period_id,
        force_warnings: forceWarnings,
      });
      setFeedbackMessage({
        type: 'success',
        text: `Roster for w/c ${res.data.week_start} is now PUBLISHED and visible to staff!`,
      });
      setValidationDialogOpen(false);
      await fetchPeriodData();
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Publication failed.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Unpublish Roster (Revert to Draft)
  const handleUnpublish = async () => {
    if (!period) return;
    if (!window.confirm('Reverting to Draft will hide this schedule from staff until re-published. Continue?')) {
      return;
    }
    setActionLoading(true);
    try {
      await apiClient.post('/client-profile/attendance/roster/unpublish/', {
        period_id: period.period_id,
      });
      setFeedbackMessage({
        type: 'success',
        text: 'Roster reverted to DRAFT. Shifts are hidden from staff.',
      });
      await fetchPeriodData();
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to unpublish.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 4. View Staff Acknowledgements
  const handleViewAcknowledgements = async () => {
    if (!period) return;
    setActionLoading(true);
    try {
      const res = await apiClient.get(
        `/client-profile/attendance/roster/acknowledgements/${period.period_id}/`
      );
      setAckData(res.data);
      setAckDialogOpen(true);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to load acknowledgements.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 5. Copy Week
  const handleCopyWeek = async () => {
    if (!period) return;
    setActionLoading(true);
    try {
      const res = await apiClient.post('/client-profile/attendance/roster/copy-week/', {
        source_period_id: period.period_id,
        target_week_start: targetWeekDate,
        include_assignments: copyIncludeAssignments,
        overwrite: copyOverwrite,
      });
      setCopyDialogOpen(false);
      setFeedbackMessage({
        type: 'success',
        text: `Week successfully copied to ${res.data.target_week_start} as DRAFT! (${res.data.counts.slots_copied} slots, ${res.data.counts.assignments_copied} assignments)`,
      });
      // Navigate to target week
      onNavigateWeek?.(moment(targetWeekDate).toDate());
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to copy roster week.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  // 6. Templates
  const handleOpenTemplates = async () => {
    if (!pharmacyId) return;
    setTemplateDialogOpen(true);
    try {
      const res = await apiClient.get(
        `/client-profile/attendance/roster/templates/?pharmacy_id=${pharmacyId}`
      );
      setSavedTemplates(res.data);
      if (res.data.length > 0) {
        setSelectedTemplateId(res.data[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load templates', err);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!period || !newTemplateName.trim()) return;
    setActionLoading(true);
    try {
      await apiClient.post('/client-profile/attendance/roster/templates/', {
        from_period_id: period.period_id,
        name: newTemplateName.trim(),
        include_users: templateIncludeUsers,
      });
      setFeedbackMessage({
        type: 'success',
        text: `Template "${newTemplateName}" saved successfully!`,
      });
      setNewTemplateName('');
      setTemplateDialogOpen(false);
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to save template.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplateId) return;
    setActionLoading(true);
    try {
      const res = await apiClient.post('/client-profile/attendance/roster/templates/apply/', {
        template_id: selectedTemplateId,
        target_week_start: mondayStr,
        include_assignments: templateIncludeUsers,
        overwrite: templateOverwrite,
      });
      setFeedbackMessage({
        type: 'success',
        text: `Template applied to w/c ${mondayStr}! (${res.data.counts.slots_created} shifts created)`,
      });
      setTemplateDialogOpen(false);
      await fetchPeriodData();
      onRosterUpdated?.();
    } catch (err: any) {
      setFeedbackMessage({
        type: 'error',
        text: err.response?.data?.error || 'Failed to apply template.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (!pharmacyId) return null;

  const isPublished = period?.status === 'PUBLISHED';

  return (
    <Card
      elevation={2}
      sx={{
        mb: 2.5,
        borderRadius: 2.5,
        border: '1px solid',
        borderColor: isPublished ? 'success.light' : 'warning.light',
        background: isPublished
          ? 'linear-gradient(135deg, rgba(237, 247, 237, 0.6) 0%, rgba(255, 255, 255, 0.9) 100%)'
          : 'linear-gradient(135deg, rgba(255, 248, 225, 0.6) 0%, rgba(255, 255, 255, 0.9) 100%)',
      }}
    >
      <CardContent sx={{ p: { xs: 1.5, md: 2 } }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          alignItems={{ xs: 'flex-start', md: 'center' }}
          justifyContent="space-between"
        >
          {/* Week Info & Status */}
          <Box>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap">
              <Typography variant="h6" sx={{ fontWeight: 700, fontSize: { xs: 16, md: 18 } }}>
                {monday.format('MMM D')} – {sunday.format('MMM D, YYYY')}
              </Typography>

              {isLoading ? (
                <CircularProgress size={20} />
              ) : isPublished ? (
                <Chip
                  icon={<CheckCircleIcon sx={{ fontSize: 16 }} />}
                  label="PUBLISHED"
                  color="success"
                  size="small"
                  sx={{ fontWeight: 700, letterSpacing: 0.5 }}
                />
              ) : (
                <Tooltip title="Draft schedules are strictly hidden from staff until published.">
                  <Chip
                    icon={<WarningAmberIcon sx={{ fontSize: 16 }} />}
                    label="DRAFT (HIDDEN)"
                    color="warning"
                    size="small"
                    sx={{ fontWeight: 700, letterSpacing: 0.5 }}
                  />
                </Tooltip>
              )}

              {period && (
                <Typography variant="body2" color="text.secondary">
                  ({period.total_assignments} {period.total_assignments === 1 ? 'shift' : 'shifts'} scheduled)
                </Typography>
              )}
            </Stack>

            {isPublished && period?.published_at && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Published {moment(period.published_at).format('MMM D, h:mm A')}
                {period.published_by ? ` by ${period.published_by}` : ''}
              </Typography>
            )}
          </Box>

          {/* Action Buttons Toolbar */}
          <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
            {/* 1. Validation */}
            <Button
              variant="outlined"
              size="small"
              color="primary"
              startIcon={<FactCheckIcon />}
              onClick={handleValidate}
              disabled={actionLoading || !period}
            >
              Validate
            </Button>

            {/* 2. Publish / Unpublish */}
            {!isPublished ? (
              <Button
                variant="contained"
                size="small"
                color="success"
                startIcon={<PublishIcon />}
                onClick={() => handlePublish(true)}
                disabled={actionLoading || !period}
                sx={{ fontWeight: 700 }}
              >
                Publish Roster
              </Button>
            ) : (
              <Button
                variant="outlined"
                size="small"
                color="warning"
                startIcon={<UndoIcon />}
                onClick={handleUnpublish}
                disabled={actionLoading || !period}
              >
                Unpublish to Draft
              </Button>
            )}

            {/* 3. Acknowledgements (if published) */}
            {isPublished && (
              <Button
                variant="outlined"
                size="small"
                color="info"
                startIcon={<HowToRegIcon />}
                onClick={handleViewAcknowledgements}
                disabled={actionLoading}
              >
                Staff Status
              </Button>
            )}

            {/* 4. Copy Week */}
            <Button
              variant="outlined"
              size="small"
              startIcon={<ContentCopyIcon />}
              onClick={() => setCopyDialogOpen(true)}
              disabled={actionLoading || !period}
            >
              Copy Week
            </Button>

            {/* 5. Templates */}
            <Button
              variant="outlined"
              size="small"
              startIcon={<BookmarkAddIcon />}
              onClick={handleOpenTemplates}
              disabled={actionLoading}
            >
              Templates
            </Button>
          </Stack>
        </Stack>

        {/* Global Feedback Banner */}
        {feedbackMessage && (
          <Alert
            severity={feedbackMessage.type}
            sx={{ mt: 1.5, py: 0.5 }}
            onClose={() => setFeedbackMessage(null)}
          >
            {feedbackMessage.text}
          </Alert>
        )}
      </CardContent>

      {/* =================================================================== */}
      {/* DIALOG 1: Validation Diagnostics */}
      {/* =================================================================== */}
      <Dialog
        open={validationDialogOpen}
        onClose={() => setValidationDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <FactCheckIcon color="primary" />
            <Typography variant="h6">Pre-Publish Validation Diagnostics</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setValidationDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {validationResult && (
            <Stack spacing={2}>
              {validationResult.is_valid && validationResult.warnings.length === 0 ? (
                <Alert severity="success" icon={<CheckCircleIcon fontSize="inherit" />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    All Validation Checks Passed!
                  </Typography>
                  No double-bookings, role mismatches, approved leave conflicts, or availability issues detected. Ready to publish.
                </Alert>
              ) : null}

              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <Alert severity="error" icon={<ErrorOutlineIcon fontSize="inherit" />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {validationResult.errors.length} Blocking {validationResult.errors.length === 1 ? 'Error' : 'Errors'}:
                  </Typography>
                  <List dense disablePadding>
                    {validationResult.errors.map((err, i) => (
                      <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={`• ${err.message}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              )}

              {/* Warnings */}
              {validationResult.warnings.length > 0 && (
                <Alert severity="warning" icon={<WarningAmberIcon fontSize="inherit" />}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    {validationResult.warnings.length} {validationResult.warnings.length === 1 ? 'Warning' : 'Warnings'}:
                  </Typography>
                  <List dense disablePadding>
                    {validationResult.warnings.map((warn, i) => (
                      <ListItem key={i} disableGutters sx={{ py: 0.25 }}>
                        <ListItemText
                          primary={`• ${warn.message}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Alert>
              )}

              <Box sx={{ bgcolor: 'action.hover', p: 1.5, borderRadius: 1.5 }}>
                <Typography variant="caption" color="text.secondary">
                  Audited <strong>{validationResult.total_assignments}</strong> shift assignments across{' '}
                  <strong>{validationResult.total_workers}</strong> unique workers for the week.
                </Typography>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setValidationDialogOpen(false)}>Close</Button>
          {!isPublished && (
            <Button
              variant="contained"
              color="success"
              startIcon={<PublishIcon />}
              onClick={() => handlePublish(true)}
              disabled={validationResult?.errors.length ? validationResult.errors.length > 0 : false}
            >
              Publish Now
            </Button>
          )}
        </DialogActions>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 2: Staff Acknowledgements Breakdown */}
      {/* =================================================================== */}
      <Dialog
        open={ackDialogOpen}
        onClose={() => setAckDialogOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <HowToRegIcon color="info" />
            <Typography variant="h6">Staff Shift Acknowledgements</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setAckDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {ackData && (
            <Stack spacing={2.5}>
              {/* Summary Metrics */}
              <Grid container spacing={2}>
                <Grid item xs={4}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'grey.50' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700 }}>
                      {ackData.total_workers}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Rostered Staff
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'success.50' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'success.main' }}>
                      {ackData.acknowledged_count}
                    </Typography>
                    <Typography variant="caption" color="success.main">
                      Confirmed
                    </Typography>
                  </Paper>
                </Grid>
                <Grid item xs={4}>
                  <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: 'warning.50' }}>
                    <Typography variant="h5" sx={{ fontWeight: 700, color: 'warning.main' }}>
                      {ackData.pending_count}
                    </Typography>
                    <Typography variant="caption" color="warning.main">
                      Pending
                    </Typography>
                  </Paper>
                </Grid>
              </Grid>

              {/* Workers List */}
              <List disablePadding>
                {ackData.workers.map((w) => (
                  <ListItem
                    key={w.id}
                    divider
                    sx={{
                      py: 1.5,
                      px: 2,
                      bgcolor: w.is_acknowledged ? 'rgba(46, 125, 50, 0.04)' : 'transparent',
                      borderRadius: 1,
                      mb: 0.5,
                    }}
                  >
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                            {w.name}
                          </Typography>
                          <Chip label={w.role} size="small" variant="outlined" />
                          <Typography variant="caption" color="text.secondary">
                            ({w.shift_count} {w.shift_count === 1 ? 'shift' : 'shifts'})
                          </Typography>
                        </Stack>
                      }
                      secondary={
                        w.notes ? (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                            Note: <em>"{w.notes}"</em>
                          </Typography>
                        ) : null
                      }
                    />
                    <Box sx={{ textAlign: 'right' }}>
                      {w.is_acknowledged ? (
                        <Stack alignItems="flex-end" spacing={0.25}>
                          <Chip
                            icon={<CheckCircleIcon sx={{ fontSize: 14 }} />}
                            label="Acknowledged"
                            color="success"
                            size="small"
                          />
                          {w.acknowledged_at && (
                            <Typography variant="caption" color="text.secondary">
                              {moment(w.acknowledged_at).format('MMM D, h:mm A')}
                            </Typography>
                          )}
                        </Stack>
                      ) : (
                        <Chip label="Pending Confirmation" color="warning" size="small" variant="outlined" />
                      )}
                    </Box>
                  </ListItem>
                ))}
              </List>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setAckDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 3: Copy Week */}
      {/* =================================================================== */}
      <Dialog
        open={copyDialogOpen}
        onClose={() => setCopyDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ContentCopyIcon color="primary" />
            <Typography variant="h6">Copy Roster Week</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setCopyDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Alert severity="info">
              Copies shifts from w/c <strong>{mondayStr}</strong> into a target week as <strong>DRAFT</strong>, protecting against accidental publication.
            </Alert>

            <TextField
              label="Target Week Start (Monday)"
              type="date"
              value={targetWeekDate}
              onChange={(e) => setTargetWeekDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Must be a Monday."
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={copyIncludeAssignments}
                  onChange={(e) => setCopyIncludeAssignments(e.target.checked)}
                />
              }
              label="Include assigned workers (uncheck to copy empty schedule structure)"
            />

            <FormControlLabel
              control={
                <Checkbox
                  checked={copyOverwrite}
                  onChange={(e) => setCopyOverwrite(e.target.checked)}
                />
              }
              label="Overwrite existing shifts in target week if already scheduled"
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setCopyDialogOpen(false)}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<ArrowForwardIcon />}
            onClick={handleCopyWeek}
            disabled={actionLoading || !targetWeekDate}
          >
            Copy as Draft
          </Button>
        </DialogActions>
      </Dialog>

      {/* =================================================================== */}
      {/* DIALOG 4: Templates Management */}
      {/* =================================================================== */}
      <Dialog
        open={templateDialogOpen}
        onClose={() => setTemplateDialogOpen(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <BookmarkAddIcon color="primary" />
            <Typography variant="h6">Roster Templates</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setTemplateDialogOpen(false)}>
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <Tabs
            value={templateTab}
            onChange={(_, val) => setTemplateTab(val)}
            sx={{ mb: 2 }}
          >
            <Tab label="Save Current Week" value="save" />
            <Tab label={`Apply Saved (${savedTemplates.length})`} value="apply" />
          </Tabs>

          {templateTab === 'save' ? (
            <Stack spacing={2.5}>
              <Typography variant="body2" color="text.secondary">
                Saves current schedule (w/c {mondayStr}) as a template for rapid planning in future weeks.
              </Typography>

              <TextField
                label="Template Name"
                placeholder="e.g. Standard 7-Day Roster"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                fullWidth
                required
              />

              <FormControlLabel
                control={
                  <Checkbox
                    checked={templateIncludeUsers}
                    onChange={(e) => setTemplateIncludeUsers(e.target.checked)}
                  />
                }
                label="Include staff assignments in template"
              />

              <Button
                variant="contained"
                color="primary"
                onClick={handleSaveAsTemplate}
                disabled={actionLoading || !newTemplateName.trim()}
              >
                Save Template
              </Button>
            </Stack>
          ) : (
            <Stack spacing={2.5}>
              {savedTemplates.length === 0 ? (
                <Alert severity="info">No templates saved yet for this pharmacy.</Alert>
              ) : (
                <>
                  <Typography variant="body2" color="text.secondary">
                    Select a template to apply to the current week (w/c {mondayStr}) as <strong>DRAFT</strong>:
                  </Typography>

                  <Select
                    value={selectedTemplateId ?? ''}
                    onChange={(e) => setSelectedTemplateId(Number(e.target.value))}
                    fullWidth
                  >
                    {savedTemplates.map((t) => (
                      <MenuItem key={t.id} value={t.id}>
                        {t.name} ({t.total_slots} {t.total_slots === 1 ? 'slot' : 'slots'})
                      </MenuItem>
                    ))}
                  </Select>

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={templateIncludeUsers}
                        onChange={(e) => setTemplateIncludeUsers(e.target.checked)}
                      />
                    }
                    label="Include template worker assignments"
                  />

                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={templateOverwrite}
                        onChange={(e) => setTemplateOverwrite(e.target.checked)}
                      />
                    }
                    label="Overwrite existing shifts in this week"
                  />

                  <Button
                    variant="contained"
                    color="primary"
                    onClick={handleApplyTemplate}
                    disabled={actionLoading || !selectedTemplateId}
                  >
                    Apply Template to Week
                  </Button>
                </>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={() => setTemplateDialogOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Card>
  );
}
