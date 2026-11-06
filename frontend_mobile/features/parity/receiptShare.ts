import * as Sharing from 'expo-sharing';
import { File, Paths } from 'expo-file-system';
import { finance } from '@chemisttasker/shared-core';
import { nativeFileBytes } from './nativeFileBytes';

export interface ReceiptFileHandle {
  uri: string;
  create: (options?: { overwrite?: boolean }) => void;
  write: (data: Uint8Array) => void | Promise<void>;
  delete: () => void | Promise<void>;
}

export interface ReceiptShareDeps {
  fetchReceipt: (receiptId: number) => Promise<Blob>;
  readBytes: (blob: Blob) => Promise<Uint8Array>;
  createFile: (filename: string) => ReceiptFileHandle;
  isShareAvailable: () => Promise<boolean>;
  shareAsync: (uri: string, options?: { dialogTitle?: string; mimeType?: string; UTI?: string }) => Promise<void>;
}

export function safeMimeAndExt(mime?: string): { ext: string; mimeType: string; uti?: string } {
  const norm = (mime || '').toLowerCase().trim();
  if (norm.includes('pdf')) return { ext: 'pdf', mimeType: 'application/pdf', uti: 'com.adobe.pdf' };
  if (norm.includes('png')) return { ext: 'png', mimeType: 'image/png', uti: 'public.png' };
  if (norm.includes('jpeg') || norm.includes('jpg')) return { ext: 'jpg', mimeType: 'image/jpeg', uti: 'public.jpeg' };
  if (norm.includes('webp')) return { ext: 'webp', mimeType: 'image/webp', uti: 'org.webmproject.webp' };
  return { ext: 'bin', mimeType: 'application/octet-stream' };
}

export const defaultReceiptShareDeps: ReceiptShareDeps = {
  fetchReceipt: (id) => finance.receipt(id),
  readBytes: (blob) => nativeFileBytes(blob),
  createFile: (name) => new File(Paths.cache, name),
  isShareAvailable: () => Sharing.isAvailableAsync(),
  shareAsync: (uri, opts) => Sharing.shareAsync(uri, opts),
};

export class ReceiptShareSession {
  private busy = false;
  private currentScope = '';
  private generation = 0;

  constructor(private deps: ReceiptShareDeps = defaultReceiptShareDeps) {}

  setScope(accountScope: string, receiptId: number): void {
    this.currentScope = `${accountScope}:${receiptId}`;
    this.generation++;
    this.busy = false;
  }

  invalidate(): void {
    this.generation++;
    this.busy = false;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  async openReceipt(
    accountScope: string,
    receiptId: number
  ): Promise<{ ok: boolean; error?: string }> {
    const scope = `${accountScope}:${receiptId}`;
    if (this.currentScope !== scope) {
      this.setScope(accountScope, receiptId);
    }
    // Synchronous same-tick write mutex
    if (this.busy) {
      return { ok: false, error: 'Operation already in progress' };
    }
    this.busy = true;
    const attempt = ++this.generation;
    const isCurrent = () => this.currentScope === scope && this.generation === attempt;

    let file: ReceiptFileHandle | null = null;
    try {
      const blob = await this.deps.fetchReceipt(receiptId);
      if (!isCurrent()) return { ok: false };

      const bytes = await this.deps.readBytes(blob);
      if (!isCurrent()) return { ok: false };

      const { ext, mimeType, uti } = safeMimeAndExt((blob as any)?.type);
      const tempName = `receipt-${receiptId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      file = this.deps.createFile(tempName);
      file.create({ overwrite: true });
      await Promise.resolve(file.write(bytes));
      if (!isCurrent()) return { ok: false };

      const available = await this.deps.isShareAvailable();
      if (!isCurrent()) return { ok: false };
      if (!available) {
        throw new Error('Sharing is unavailable on this device.');
      }

      await this.deps.shareAsync(file.uri, {
        dialogTitle: 'Receipt',
        mimeType,
        UTI: uti,
      });
      return { ok: true };
    } catch (e: any) {
      if (isCurrent()) {
        return { ok: false, error: e?.message || 'Unable to download or share receipt.' };
      }
      return { ok: false };
    } finally {
      if (file) {
        try {
          await Promise.resolve(file.delete());
        } catch {
          // Do not mask primary failure
        }
      }
      if (isCurrent()) {
        this.busy = false;
      }
    }
  }
}
