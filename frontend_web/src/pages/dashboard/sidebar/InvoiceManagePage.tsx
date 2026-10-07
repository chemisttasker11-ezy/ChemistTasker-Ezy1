// src/pages/dashboard/sidebar/InvoiceManagePage.tsx
import React, { useState, useEffect, MouseEvent } from 'react';
import {
  Container,
  Typography,
  Box,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  IconButton,
  CircularProgress,
  Snackbar,
  Menu,
  MenuItem,
  Pagination,
} from '@mui/material';
import AddIcon from '@mui/icons-material/Add';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import SendIcon from '@mui/icons-material/Send';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { useAuth } from '../../../contexts/AuthContext';
import { deleteInvoice, getInvoicePdfUrl, getInvoices, sendInvoiceEmail } from '@chemisttasker/shared-core';

dayjs.extend(utc);

interface Invoice {
  id: number;
  invoice_date: string;
  due_date: string | null;
  pharmacy_name_snapshot: string;
  custom_bill_to_name?: string;
  total: string;
  status: string;
}

export default function InvoiceManagePage() {
  const auth = useAuth();
  const navigate = useNavigate();

  // Show spinner until auth is loaded
  if (!auth?.user) {
    return (
      <Container sx={{ textAlign: 'center', py: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState<{ open: boolean; msg: string }>({
    open: false,
    msg: '',
  });

  // Pagination
  const itemsPerPage = 5;
  const [page, setPage] = useState(1);

  // Action menu
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [menuInvoiceId, setMenuInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    getInvoices()
      .then((res) => {
        const list = Array.isArray((res as any)?.results)
          ? (res as any).results
          : Array.isArray(res as any)
          ? (res as any)
          : [];
        const sorted: Invoice[] = list.sort(
          (a: Invoice, b: Invoice) =>
            dayjs.utc(b.invoice_date).valueOf() -
            dayjs.utc(a.invoice_date).valueOf()
        );
        setInvoices(sorted);
      })
      .catch(() => {
        setSnackbar({
          open: true,
          msg: 'Failed to load invoices.',
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCloseSnackbar = () =>
    setSnackbar((s) => ({ ...s, open: false }));

  const handlePageChange = (_: React.ChangeEvent<unknown>, value: number) => {
    setPage(value);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const paginated = invoices.slice(
    (page - 1) * itemsPerPage,
    page * itemsPerPage
  );
  const pageCount = Math.ceil(invoices.length / itemsPerPage);

  // New Invoice → navigate to generator
  const handleNew = () => navigate('new');

  // Row click → detail view
  const handleRowClick = (id: number) => navigate(`${id}`);

  // Menu open
  const handleMenuOpen = (e: MouseEvent<HTMLElement>, id: number) => {
    e.stopPropagation();
    setAnchorEl(e.currentTarget);
    setMenuInvoiceId(id);
  };
  const handleMenuClose = () => {
    setAnchorEl(null);
    setMenuInvoiceId(null);
  };

  // Delete
  const handleDelete = async () => {
    if (!menuInvoiceId) return;
    try {
      await deleteInvoice(menuInvoiceId);
      setInvoices((prev) =>
        prev.filter((inv) => inv.id !== menuInvoiceId)
      );
    } catch {
      setSnackbar({ open: true, msg: 'Delete failed.' });
    }
    handleMenuClose();
  };

  // Edit → navigate to generator with state
  const handleEdit = () => {
    if (!menuInvoiceId) return;
    navigate(`${menuInvoiceId}`);
    handleMenuClose();
  };

  // // Send (stub)
  // const handleSend = () => {
  //   setSnackbar({ open: true, msg: 'Send not implemented.' });
  //   handleMenuClose();
  // };


  // Send (real)
  const handleSend = async () => {
    if (!menuInvoiceId) return;
    try {
      await sendInvoiceEmail(menuInvoiceId);
      setInvoices(prev =>
        prev.map(inv => inv.id === menuInvoiceId ? { ...inv, status: 'sent' } : inv)
      );
      setSnackbar({ open: true, msg: `Invoice #${menuInvoiceId} sent.` });
    } catch {
      setSnackbar({ open: true, msg: 'Failed to send invoice.' });
    } finally {
      handleMenuClose();
    }
  };


  // PDF (stub)
  const handlePdf = async () => {
    if (!menuInvoiceId) return;
    const url = getInvoicePdfUrl(menuInvoiceId);
    window.open(url, '_blank');
    handleMenuClose();
  };

  if (loading) {
    return (
      <Container sx={{ textAlign: 'center', py: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container sx={{ py: 4 }}>
      {/* Header */}
      <Box
        display="flex"
        justifyContent="space-between"
        alignItems="center"
        mb={3}
      >
        <Typography variant="h4">Invoices</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={handleNew}
        >
          New Invoice
        </Button>
      </Box>

      {/* Table */}
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
          {paginated.map((inv) => (
            <TableRow
              key={inv.id}
              hover
              onClick={() => handleRowClick(inv.id)}
              sx={{ cursor: 'pointer' }}
            >
              <TableCell>{inv.id}</TableCell>
              <TableCell>
                {inv.pharmacy_name_snapshot ||
                  inv.custom_bill_to_name}
              </TableCell>
              <TableCell>
                {dayjs.utc(inv.invoice_date).local().format('YYYY-MM-DD')}
              </TableCell>
              <TableCell>{inv.total}</TableCell>
              <TableCell>{inv.status}</TableCell>
              <TableCell align="right">
                <IconButton
                  onClick={(e) => handleMenuOpen(e, inv.id)}
                >
                  <MoreVertIcon />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* Pagination */}
      {pageCount > 1 && (
        <Box display="flex" justifyContent="center" mt={2}>
          <Pagination
            count={pageCount}
            page={page}
            onChange={handlePageChange}
            color="primary"
          />
        </Box>
      )}

      {/* Actions Menu */}
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={handleEdit}>
          <EditIcon fontSize="small" /> Edit
        </MenuItem>
        <MenuItem onClick={handleSend} disabled={
          invoices.find(i => i.id === menuInvoiceId)?.status === 'sent'
        }>
         <SendIcon fontSize="small" /> Send
       </MenuItem>
        <MenuItem onClick={handlePdf}>
          <PictureAsPdfIcon fontSize="small" /> Download PDF
        </MenuItem>
        <MenuItem onClick={handleDelete}>
          <DeleteIcon fontSize="small" /> Delete
        </MenuItem>
      </Menu>

      {/* Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={3000}
        onClose={handleCloseSnackbar}
        message={snackbar.msg}
        action={
          <IconButton
            size="small"
            color="inherit"
            onClick={handleCloseSnackbar}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        }
      />
    </Container>
  );
}
