import type { TspiReportFile } from './types';
import type { TspiBrainClient, TspiBrainMe } from './brainClient';
import {
  TspiReportError,
  isValidReportId,
  parsePlanRecord,
  parseViewer,
  reportFileName,
} from './report';
import { TspiBrainError } from './brainClient';
import { renderReportPdf } from './pdf';

export type TspiReportSource = Pick<TspiBrainClient, 'getReport' | 'getMe'> &
  Partial<Pick<TspiBrainClient, 'getReportPdf'>>;

/** M11 (v2) report ids are hyphenated UUIDs; v1 report ids are not. */
const V2_REPORT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const toReportError = (error: unknown): TspiReportError => {
  if (error instanceof TspiReportError) {
    return error;
  }
  if (error instanceof TspiBrainError) {
    const code =
      error.code === 'not_found' || error.code === 'forbidden'
        ? error.code
        : error.code === 'invalid'
          ? 'invalid_id'
          : 'unavailable';
    return new TspiReportError(code, error.message);
  }
  return new TspiReportError('unavailable', 'TSPI Brain request failed');
};

/**
 * Builds the treatment-plan PDF for one report straight from the TSPI Brain REST API (M04), with
 * the signed-in user's aud=tspi-api token: no model and no MCP tool. The Brain authorizes the read,
 * so a report the user cannot open surfaces here as `forbidden` or `not_found`.
 *
 * M11: a v2 report (UUID id) is the Brain's own PDF, streamed unchanged. The pdfkit renderer
 * below stays for v1 reports until the v1 toolset is switched off (M12).
 */
export const createTspiReportPdf = async (
  reportId: string,
  brain: TspiReportSource,
): Promise<TspiReportFile> => {
  if (!isValidReportId(reportId)) {
    throw new TspiReportError('invalid_id', 'Invalid report id');
  }
  if (brain.getReportPdf && V2_REPORT_ID.test(reportId)) {
    // M11: the Brain made and stored this report's PDF; stream it as is.
    try {
      return await brain.getReportPdf(reportId);
    } catch (error) {
      if (!(error instanceof TspiBrainError && error.code === 'not_found')) {
        throw toReportError(error);
      }
      // no v2 report with this id: try it as a v1 report below
    }
  }
  try {
    const [report, me] = await Promise.all([
      brain.getReport(reportId),
      brain.getMe().catch((): TspiBrainMe => ({})),
    ]);
    const plan = parsePlanRecord(JSON.stringify(report));
    const viewer = parseViewer(JSON.stringify(me));
    const buffer = await renderReportPdf(plan, viewer);
    return { filename: reportFileName(plan), buffer };
  } catch (error) {
    throw toReportError(error);
  }
};
