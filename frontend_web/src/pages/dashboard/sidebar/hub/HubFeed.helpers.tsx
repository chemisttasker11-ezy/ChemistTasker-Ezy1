import { useRef, useState } from 'react';
import {
  Box,
  CircularProgress,
  LinearProgress,
  Stack,
  Typography,
} from '@mui/material';
import type { HubComment, HubReactionType } from '../../../../types/hub';

export const reactionEmojis: Record<HubReactionType, string> = {
  LIKE: '\u{1F44D}',
  CELEBRATE: '\u{1F389}',
  SUPPORT: '\u{1F64C}',
  INSIGHTFUL: '\u{1F4A1}',
  LOVE: '\u{2764}\u{FE0F}',
};

export const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    return error.message.trim();
  }
  const responseDetail = (
    error as { response?: { data?: { detail?: string } } } | null
  )?.response?.data?.detail;
  if (typeof responseDetail === 'string' && responseDetail.trim()) {
    return responseDetail.trim();
  }
  const detail = (error as { detail?: string } | null)?.detail;
  if (typeof detail === 'string' && detail.trim()) {
    return detail.trim();
  }
  return fallback;
};

export const useSubmissionGuard = () => {
  const lockRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  const start = () => {
    if (lockRef.current) {
      return false;
    }
    lockRef.current = true;
    setSubmitting(true);
    return true;
  };

  const finish = () => {
    lockRef.current = false;
    setSubmitting(false);
  };

  return { submitting, start, finish };
};

export function SubmissionStatusNotice({ message }: { message: string }) {
  return (
    <Box sx={{ px: 2, pb: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1 }}>
        <CircularProgress size={18} />
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      </Stack>
      <LinearProgress />
    </Box>
  );
}

export type CommentNode = HubComment & { replies: CommentNode[] };

export const buildCommentTree = (list: HubComment[]): CommentNode[] => {
  if (!list?.length) {
    return [];
  }
  const sorted = [...list].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
  const nodes = sorted.map((comment) => ({ ...comment, replies: [] as CommentNode[] }));
  const lookup = new Map<number, CommentNode>();
  nodes.forEach((node) => lookup.set(node.id, node));
  const roots: CommentNode[] = [];
  nodes.forEach((node) => {
    if (node.parentCommentId && lookup.has(node.parentCommentId)) {
      lookup.get(node.parentCommentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  });
  return roots;
};
