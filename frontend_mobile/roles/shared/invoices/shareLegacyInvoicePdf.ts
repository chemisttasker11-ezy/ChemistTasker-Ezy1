import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { downloadInvoicePdf } from '@chemisttasker/shared-core';
import { nativeFileBytes } from '@/features/parity/nativeFileBytes';

/** Invoice downloads use bearer-authenticated shared-core transport, never a public PDF URL. */
export async function shareLegacyInvoicePdf(id: number): Promise<void> {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Invalid invoice.');
  if (!(await Sharing.isAvailableAsync())) throw new Error('PDF sharing is not available on this device.');
  const blob = await downloadInvoicePdf(id);
  const bytes = await nativeFileBytes(blob);
  if (bytes.length < 5 || bytes[0] !== 37 || bytes[1] !== 80 || bytes[2] !== 68 || bytes[3] !== 70 || bytes[4] !== 45) {
    throw new Error('The invoice could not be opened as a PDF.');
  }
  // Save only in ephemeral cache; never expose credentials in a URL or persisted file name.
  const file = new File(Paths.cache, `invoice-${id}-${Date.now()}.pdf`);
  file.create({ overwrite: false });
  await file.write(bytes);
  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Open or share invoice PDF',
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
  });
}
