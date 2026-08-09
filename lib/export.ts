/**
 * CSV exports.
 *
 * `GET /admin/permissions/export` and `GET /admin/profile-requests/export`
 * return `text/csv` in the response body rather than a download URL, so the
 * app writes it to the cache directory and hands the file to the OS share
 * sheet. That is what lets an admin get it into Drive, Gmail or WhatsApp
 * without the app needing storage permissions.
 *
 * Nothing is left behind that matters: the cache directory is the OS's to
 * clear, and each export overwrites the previous file of the same name.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export class ExportError extends Error {}

/** `passes-2026-08-07.csv` — dated, so two exports don't look identical. */
function filename(prefix: string) {
  const today = new Date().toISOString().slice(0, 10);
  return `${prefix}-${today}.csv`;
}

/**
 * Writes the CSV and opens the share sheet. Returns the row count so the
 * caller can say how much came back.
 */
export async function shareCsv(csv: string, prefix: string) {
  if (!csv || !csv.trim()) {
    throw new ExportError('The export came back empty — nothing matches that filter.');
  }

  const uri = `${FileSystem.cacheDirectory}${filename(prefix)}`;
  await FileSystem.writeAsStringAsync(uri, csv, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  if (!(await Sharing.isAvailableAsync())) {
    throw new ExportError('This device has nowhere to share the file to.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'text/csv',
    dialogTitle: 'Export',
    UTI: 'public.comma-separated-values-text',
  });

  /* Minus the header row. */
  return Math.max(0, csv.trim().split('\n').length - 1);
}
