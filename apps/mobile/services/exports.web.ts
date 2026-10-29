import { api } from '@/services/api';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

/** Web: download the file through the authenticated API client and save it with the browser. */
export async function shareExport(sessionId: string, format: ExportFormat, sessionDate: string): Promise<void> {
  const response = await api.get<Blob>(`/admin/sessions/${sessionId}/export`, {
    params: { format },
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = `EMS-Food-${sessionDate}.${format}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

export async function fetchExportText(sessionId: string): Promise<string> {
  const { data } = await api.get<string>(`/admin/sessions/${sessionId}/export`, {
    params: { format: 'txt' },
    responseType: 'text',
  });
  return data;
}

export async function copyExportText(sessionId: string): Promise<void> {
  await navigator.clipboard.writeText(await fetchExportText(sessionId));
}

export async function shareExportText(sessionId: string): Promise<void> {
  const text = await fetchExportText(sessionId);
  if (navigator.share) {
    await navigator.share({ text });
  } else {
    await navigator.clipboard.writeText(text);
  }
}
