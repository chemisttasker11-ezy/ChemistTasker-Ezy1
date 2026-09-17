export function today(): string {
  const value = new Date();
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}
export function dueDate(value: string, days: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isInteger(days) || days < 0 || days > 365) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const canonical = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  if (canonical !== value) return '';
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const dollars = (value: string | number): string => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(Number(value));
export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = filename; document.body.appendChild(link); link.click(); link.remove();
  // Delay revocation until the browser has begun reading the object URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function csvCell(value: string | number): string {
  const text = String(value);
  // Spreadsheet programs may ignore whitespace before a formula introducer.
  const safe = /^[\s]*[=+@\-]/.test(text) || /^[\t\r\n]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  download(new Blob(['\ufeff', rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }), filename);
}

export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : 'Something went wrong. Please try again.';
