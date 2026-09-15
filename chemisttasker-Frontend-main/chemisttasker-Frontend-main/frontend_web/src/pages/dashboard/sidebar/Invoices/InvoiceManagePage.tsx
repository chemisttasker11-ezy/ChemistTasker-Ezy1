import React, { useEffect, useMemo, useState, type MouseEvent } from 'react';
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Container,
  IconButton,
  Menu,
  MenuItem,
  Pagination,
  Paper,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import CloseIcon from '@mui/icons-material/Close';
import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import SendIcon from '@mui/icons-material/Send';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../../contexts/AuthContext';
import {
  deleteInvoice,
  getInvoicePdfUrl,
  getInvoices,
  sendInvoiceEmail,
  updateInvoice,
} from '@chemisttasker/shared-core';
import InvoiceStatsCards from './InvoiceStatsCards';
import {
  filterInvoicesByTimeframe,
  type InvoiceTimeframe,
} from './invoiceStats';

dayjs.extend(utc);

interface Invoice {
  id: number;
  invoice_date?: string;
  created_at?: string;
  due_date?: string | null;
  pharmacy_name_snapshot?: string;
  custom_bill_to_name?: string;
  total?: number | string;
  total_amount?: number | string;
  status?: string;
}

const ITEMS_PER_PAGE = 8;

const getStatusTone = (status?: string) => {
  switch (String(status || '').toLowerCase()) {
    case 'paid':
      return { bg: '#DCFCE7', fg: '#166534', label: 'Paid' };
    case 'sent':
    case 'pending':
      return { bg: '#FEF3C7', fg: '#92400E', label: 'Sent' };
    case 'draft':
      return { bg: '#E0E7FF', fg: '#4338CA', label: 'Draft' };
    default:
      return { bg: '#F3F4F6', fg: '#374151', label: status || 'Unknown' };
  }
};

const getInvoiceAmount = (invoice: Invoice) => {
  const amount = Number(invoice.total ?? invoice.total_amount ?? 0);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
};

export default function InvoiceManagePage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<InvoiceTimeframe>('this_year');
  const [page, setPage] = useState(1);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuInvoiceId, setMenuInvoiceId] = useState<number | null>(null);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string }>({
    open: false,
    msg: '',
  });

  useEffect(() => {
    getInvoices()
      .then((res) => {
        const list = Array.isArray((res as any)?.results)
          ? (res as any).results
          : Array.isArray(res as any)
            ? (res as any)
            : [];

        const sorted = [...list].sort(
          (a: Invoice, b: Invoice) =>
            dayjs.utc(b.invoice_date || b.created_at).valueOf() -
            dayjs.utc(a.invoice_date || a.created_at).valueOf(),
        );

        setInvoices(sorted);
      })
      .catch(() => {
        setSnackbar({ open: true, msg: 'Failed to load invoices.' });
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredInvoices = useMemo(
    () => filterInvoicesByTimeframe(invoices, timeframe),
    [invoices, timeframe],
  );

  const pageCount = Math.max(1, Math.ceil(filteredInvoices.length / ITEMS_PER_PAGE));
  const paginated = filteredInvoices.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);
  const selectedInvoice = invoices.find((invoice) => invoice.id === menuInvoiceId) ?? null;

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const closeSnackbar = () => setSnackbar((current) => ({ ...current, open: false }));

  const handleMenuOpen = (event: MouseEvent<HTMLElement>, id: number) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
    setMenuInvoiceId(id);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuInvoiceId(null);
  };

  const updateLocalStatus = (id: number, status: string) => {
    setInvoices((current) => current.map((invoice) => (
      invoice.id === id ? { ...invoice, status } : invoice
    )));
  };

  const handleSend = async () => {
    if (!menuInvoiceId) return;
    try {
      await sendInvoiceEmail(menuInvoiceId);
      updateLocalStatus(menuInvoiceId, 'sent');
      setSnackbar({ open: true, msg: `Invoice #${menuInvoiceId} sent.` });
    } catch {
      setSnackbar({ open: true, msg: 'Failed to send invoice.' });
    } finally {
      handleMenuClose();
    }
  };

  const handleMarkPaid = async () => {
    if (!menuInvoiceId) return;
    try {
      await updateInvoice(menuInvoiceId, { status: 'paid' } as any);
      updateLocalStatus(menuInvoiceId, 'paid');
      setSnackbar({ open: true, msg: `Invoice #${menuInvoiceId} marked as paid.` });
    } catch {
      setSnackbar({ open: true, msg: 'Failed to update invoice.' });
    } finally {
      handleMenuClose();
    }
  };

  const handleDelete = async () => {
    if (!menuInvoiceId) return;
    try {
      await deleteInvoice(menuInvoiceId);
      setInvoices((current) => current.filter((invoice) => invoice.id !== menuInvoiceId));
      setSnackbar({ open: true, msg: `Invoice #${menuInvoiceId} deleted.` });
    } catch {
      setSnackbar({ open: true, msg: 'Delete failed.' });
    } finally {
      handleMenuClose();
    }
  };

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (!auth?.user || loading) {
    return (
      <Container sx={{ py: 6, textAlign: 'center' }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      <Stack spacing={3}>
        <Box
          display="flex"
          justifyContent="space-between"
          alignItems={{ xs: 'flex-start', md: 'center' }}
          flexDirection={{ xs: 'column', md: 'row' }}
          gap={2}
        >
          <Box>
            <Typography variant="h4" fontWeight={800}>
              Invoices
            </Typography>
            <Typography color="text.secondary">
              Draft invoices are created first, sending moves them to sent, and you can mark sent invoices as paid from the action menu.
            </Typography>
          </Box>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate('new')}>
            New Invoice
          </Button>
        </Box>

        <InvoiceStatsCards
          invoices={invoices}
          timeframe={timeframe}
          onTimeframeChange={(value) => {
            setPage(1);
            setTimeframe(value);
          }}
        />

        <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid', borderColor: 'divider', overflow: 'hidden' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>Client</TableCell>
                <TableCell>Date</TableCell>
                <TableCell>Total</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {paginated.map((invoice) => {
                const tone = getStatusTone(invoice.status);

                return (
                  <TableRow
                    key={invoice.id}
                    hover
                    sx={{ cursor: 'pointer' }}
                    onClick={() => navigate(`${invoice.id}`)}
                  >
                    <TableCell>{invoice.id}</TableCell>
                    <TableCell>{invoice.pharmacy_name_snapshot || invoice.custom_bill_to_name || 'Client'}</TableCell>
                    <TableCell>
                      {dayjs.utc(invoice.invoice_date || invoice.created_at).local().format('YYYY-MM-DD')}
                    </TableCell>
                    <TableCell>${getInvoiceAmount(invoice)}</TableCell>
                    <TableCell>
                      <Chip
                        label={tone.label}
                        size="small"
                        sx={{
                          backgroundColor: tone.bg,
                          color: tone.fg,
                          fontWeight: 700,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <IconButton onClick={(event) => handleMenuOpen(event, invoice.id)}>
                        <MoreVertIcon />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })}

              {!paginated.length && (
                <TableRow>
                  <TableCell colSpan={6}>
                    <Box py={5} textAlign="center">
                      <Typography variant="h6" gutterBottom>
                        No invoices found
                      </Typography>
                      <Typography color="text.secondary">
                        Adjust the time frame or create a new invoice.
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        {pageCount > 1 && (
          <Box display="flex" justifyContent="center">
            <Pagination count={pageCount} page={page} onChange={handlePageChange} color="primary" />
          </Box>
        )}
      </Stack>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={handleMenuClose}>
        <MenuItem
          onClick={() => {
            if (menuInvoiceId) navigate(`${menuInvoiceId}`);
            handleMenuClose();
          }}
        >
          <EditIcon fontSize="small" sx={{ mr: 1 }} />
          Edit
        </MenuItem>
        <MenuItem
          onClick={handleSend}
          disabled={String(selectedInvoice?.status || '').toLowerCase() !== 'draft'}
        >
          <SendIcon fontSize="small" sx={{ mr: 1 }} />
          Send
        </MenuItem>
        <MenuItem
          onClick={handleMarkPaid}
          disabled={!['sent', 'pending'].includes(String(selectedInvoice?.status || '').toLowerCase())}
        >
          <CheckCircleOutlineIcon fontSize="small" sx={{ mr: 1 }} />
          Mark as Paid
        </MenuItem>
        <MenuItem
          onClick={() => {
            if (menuInvoiceId) window.open(getInvoicePdfUrl(menuInvoiceId), '_blank');
            handleMenuClose();
          }}
        >
          <PictureAsPdfIcon fontSize="small" sx={{ mr: 1 }} />
          Download PDF
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
          Delete
        </MenuItem>
      </Menu>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={closeSnackbar}
        message={snackbar.msg}
        action={
          <IconButton size="small" color="inherit" onClick={closeSnackbar}>
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </Container>
  );
}
