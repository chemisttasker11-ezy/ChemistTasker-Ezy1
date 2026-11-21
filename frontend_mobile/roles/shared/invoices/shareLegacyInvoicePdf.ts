import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { downloadInvoicePdf } from '@chemisttasker/shared-core';
import { nativeFileBytes } from '@/features/parity/nativeFileBytes';
import { getSessionGeneration } from '@/utils/authSession';

/** Invoice downloads use bearer-authenticated shared-core transport, never a public PDF URL. */
export async function shareLegacyInvoicePdf(id: number, current: () => boolean): Promise<void> {
  const sessionGeneration = getSessionGeneration();
  const guarded = () => current() && sessionGeneration === getSessionGeneration();
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid invoice.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('PDF sharing is not available on this device.');
  if (!guarded()) return;
  const blob = await downloadInvoicePdf(id);
  if (!guarded()) return;
  const bytes = await nativeFileBytes(blob);
  if (!guarded()) return;
  if (bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
    throw new Error('The invoice could not be opened as a PDF.');
  }
  // Save only in app cache. Remove the temporary document whether sharing
  // succeeds, is cancelled, or the native share provider reports an error.
  const file = new File(Paths.cache, `invoice-${id}-${Date.now()}.pdf`);
  try {
    file.create({ overwrite: false });
    await file.write(bytes);
    if (!guarded()) return;
    await Sharing.shareAsync(file.uri, {
      dialogTitle: 'Open or share invoice PDF',
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
    });
  } finally {
    try {
      file.delete();
    } catch {
      // A platform share provider may already have moved or removed the file.
    }
  }
}
