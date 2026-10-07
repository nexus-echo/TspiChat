import type { UIActionResult } from '@mcp-ui/client';

const REPORT_ID = '([A-Za-z0-9_-]{8,64})';
const PROMPT_PATTERN = new RegExp(
  `\\bPDF\\b[^\\n]*?\\breport(?:\\s+id)?[\\s:#]+\`?${REPORT_ID}`,
  'i',
);
const ID_PATTERN = new RegExp(`^${REPORT_ID}$`);

const readReportId = (params: Record<string, unknown> | undefined): string | undefined => {
  const id = params?.report_id ?? params?.reportId;
  return typeof id === 'string' && ID_PATTERN.test(id) ? id : undefined;
};

/**
 * Recognizes the TSPI "Download PDF" button, whichever action shape the panel sends, so the
 * PDF is fetched straight from the server instead of being handed to the model.
 */
export function getTspiPdfReportId(result: UIActionResult): string | undefined {
  if (result.type === 'prompt') {
    return PROMPT_PATTERN.exec(result.payload.prompt ?? '')?.[1];
  }
  if (result.type === 'intent' && /pdf/i.test(result.payload.intent ?? '')) {
    return readReportId(result.payload.params);
  }
  if (result.type === 'tool' && /pdf/i.test(result.payload.toolName ?? '')) {
    return readReportId(result.payload.params);
  }
  return undefined;
}

export function getAttachmentFilename(disposition: string | undefined, fallback: string): string {
  const match = /filename="?([^";]+)"?/i.exec(disposition ?? '');
  return match?.[1] ?? fallback;
}

export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
