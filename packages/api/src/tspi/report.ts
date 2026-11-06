/**
 * Report download errors. Since M12 every report is a TSPI Brain (M11) report: its id is a UUID
 * and its PDF is made and stored by the Brain. The v1 pdfkit renderer is gone.
 */
const REPORT_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TspiReportErrorCode = 'invalid_id' | 'not_found' | 'forbidden' | 'unavailable';

export class TspiReportError extends Error {
  readonly code: TspiReportErrorCode;

  constructor(code: TspiReportErrorCode, message: string) {
    super(message);
    this.name = 'TspiReportError';
    this.code = code;
  }
}

export const isValidReportId = (reportId: string): boolean => REPORT_ID_PATTERN.test(reportId);
