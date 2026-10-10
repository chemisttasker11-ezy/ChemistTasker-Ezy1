import React from 'react';
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material';
import type { Shift } from '@chemisttasker/shared-core';
import { ConfirmDialog } from '../../../../components/ui/ConfirmDialog';
import { CounterOfferDialog } from './components/Dialogs/CounterOfferDialog';
import type { useCandidateReview } from './hooks/useCandidateReview';
import type { useOfferDecisions } from './hooks/useOfferDecisions';
import type { useShiftActions } from './hooks/useShiftActions';
import type { useCounterOffers } from './hooks/useCounterOffers';
import type { DeleteConfirmDialogState } from './types';

export default function ActiveShiftsDialogs({ shifts, review, decisions, deleteConfirmDialog, setDeleteConfirmDialog, actionLoading, handleDelete, counterActionLoading }: {
    shifts: Shift[];
    review: ReturnType<typeof useCandidateReview>;
    decisions: ReturnType<typeof useOfferDecisions>;
    deleteConfirmDialog: DeleteConfirmDialogState;
    setDeleteConfirmDialog: React.Dispatch<React.SetStateAction<DeleteConfirmDialogState>>;
    actionLoading: ReturnType<typeof useShiftActions>['actionLoading'];
    handleDelete: ReturnType<typeof useShiftActions>['handleDelete'];
    counterActionLoading: ReturnType<typeof useCounterOffers>['counterActionLoading'];
}) {
    const { reviewOfferDialog, closeReview, workerRatingSummary, workerRatingComments, workerCommentsPage, workerCommentsPageCount, loadWorkerRatings } = review;
    const { handleAcceptOffer, handleRejectOffer, handleAssignCandidate, handleBuzzWorker, buzzLoadingOfferId, buzzDialog, setBuzzDialog } = decisions;
    return (<>
                {/* Dialogs */}
                <ConfirmDialog
                    open={deleteConfirmDialog.open}
                    title="Delete this shift?"
                    body={`${(shifts.find((s) => s.id === deleteConfirmDialog.shiftId) as any)?.pharmacyDetail?.name ?? 'This shift'} will be removed. Candidates can no longer see or apply for it, and you can't undo this.`}
                    confirmLabel="Delete shift"
                    busyLabel="Deleting…"
                    busy={deleteConfirmDialog.shiftId ? actionLoading[`delete_${deleteConfirmDialog.shiftId}`] ?? false : false}
                    onClose={() => setDeleteConfirmDialog({ open: false, shiftId: null })}
                    onConfirm={async () => {
                        if (deleteConfirmDialog.shiftId) {
                            const success = await handleDelete(deleteConfirmDialog.shiftId);
                            if (success) {
                                setDeleteConfirmDialog({ open: false, shiftId: null });
                            }
                        }
                    }}
                />

                <CounterOfferDialog
                    open={reviewOfferDialog.open}
                    offer={reviewOfferDialog.offer}
                    candidate={reviewOfferDialog.candidate}
                    slotId={reviewOfferDialog.slotId}
                    assignLabel={
                        reviewOfferDialog.slotId != null
                            ? 'Assign to this date'
                            : 'Assign to shift'
                    }
                    assignLoading={
                        reviewOfferDialog.shiftId != null && reviewOfferDialog.candidate?.userId != null
                            ? actionLoading[`accept_${reviewOfferDialog.shiftId}_${reviewOfferDialog.candidate.userId}`] ?? false
                            : false
                    }
                    workerRatingSummary={workerRatingSummary}
                    workerRatingComments={workerRatingComments}
                    workerCommentsPage={workerCommentsPage}
                    workerCommentsPageCount={workerCommentsPageCount}
                    counterActionLoading={counterActionLoading}
                    onClose={closeReview}
                    onAccept={(offer) => handleAcceptOffer(offer, reviewOfferDialog.shiftId, reviewOfferDialog.slotId)}
                    onReject={(offer) => handleRejectOffer(offer, reviewOfferDialog.shiftId)}
                    onAssign={(userId, slotId) => handleAssignCandidate(userId, reviewOfferDialog.shiftId, slotId)}
                    onBuzz={(offerId) => void handleBuzzWorker(offerId)}
                    buzzLoadingOfferId={buzzLoadingOfferId}
                    onPageChange={(_, value) => {
                        if (reviewOfferDialog.candidate) {
                            // Re-load ratings for the new page
                            const userId = (reviewOfferDialog.offer?.user as any)?.id ?? reviewOfferDialog.candidate?.userId;
                            if (userId) {
                                loadWorkerRatings(userId, value);
                            }
                        }
                    }}
                />

                <Dialog
                    open={buzzDialog.open}
                    onClose={() => setBuzzDialog({ open: false, message: '', sent: true })}
                    fullWidth
                    maxWidth="xs"
                    aria-labelledby="buzz-title"
                >
                    <DialogTitle id="buzz-title" sx={{ fontWeight: 600 }}>{buzzDialog.sent ? 'Reminder sent' : "Reminder not sent"}</DialogTitle>
                    <DialogContent>
                        <Typography role={buzzDialog.sent ? 'status' : 'alert'} sx={{ color: 'var(--ct-text-secondary)', fontSize: 15, lineHeight: 1.55 }}>
                            {buzzDialog.message}
                        </Typography>
                    </DialogContent>
                    <DialogActions sx={{ px: 3, pb: 2.5 }}>
                        <Button variant="contained" onClick={() => setBuzzDialog({ open: false, message: '', sent: true })} sx={{ minHeight: 40 }}>
                            Done
                        </Button>
                    </DialogActions>
                </Dialog>
    </>);
}
