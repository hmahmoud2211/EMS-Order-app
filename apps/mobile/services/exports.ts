import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Share } from 'react-native';

import { api, refreshAccessToken } from '@/services/api';
import { API_URL } from '@/services/config';
import { useAuthStore } from '@/stores/auth';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv',
};
const UTI: Record<ExportFormat, string> = {
  pdf: 'com.adobe.pdf',
  xlsx: 'org.openxmlformats.spreadsheetml.sheet',
  csv: 'public.comma-separated-values-text',
};

/** Download the consolidated export with the user's token and open the native share sheet. */
export async function shareExport(sessionId: string, format: ExportFormat, sessionDate: string): Promise<void> {
  // The native downloader bypasses the axios refresh logic, so start with a fresh access token.
  const token = (await refreshAccessToken().catch(() => null)) ?? useAuthStore.getState().accessToken;
  const destination = new File(Paths.cache, `EMS-Food-${sessionDate}.${format}`);
  if (destination.exists) destination.delete();
  const file = await File.createDownloadTask(
    `${API_URL}/admin/sessions/${sessionId}/export?format=${format}`,
    destination,
    { headers: token ? { Authorization: `Bearer ${token}` } : {} },
  ).downloadAsync();
  if (!file) throw new Error('Download failed');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: MIME[format], UTI: UTI[format], dialogTitle: 'EMS Food order' });
  }
}

export async function fetchExportText(sessionId: string): Promise<string> {
  const { data } = await api.get<string>(`/admin/sessions/${sessionId}/export`, {
    params: { format: 'txt' },
    responseType: 'text',
  });
  return data;
}

export async function copyExportText(sessionId: string): Promise<void> {
  await Clipboard.setStringAsync(await fetchExportText(sessionId));
}

export async function shareExportText(sessionId: string): Promise<void> {
  await Share.share({ message: await fetchExportText(sessionId) });
}
