import type { TspiBrainClient } from './brainClient';
import type { TspiReportFile } from './types';
import { TspiReportError, isValidReportId } from './report';
import { TspiBrainError } from './brainClient';

export type TspiReportSource = Pick<TspiBrainClient, 'getReportPdf'>;

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
 * Streams one report's PDF straight from the TSPI Brain (M11) with the signed-in user's
 * aud=tspi-api token: no model and no MCP tool. The Brain made and stored the PDF and authorizes
 * the read (physician report: clinic only; identity projection), so a report the user cannot open
 * surfaces here as `forbidden` or `not_found`. v1 report ids are no longer served (M12).
 */
export const createTspiReportPdf = async (
  reportId: string,
  brain: TspiReportSource,
): Promise<TspiReportFile> => {
  if (!isValidReportId(reportId)) {
    throw new TspiReportError('invalid_id', 'Invalid report id');
  }
  try {
    return await brain.getReportPdf(reportId);
  } catch (error) {
    throw toReportError(error);
  }
};
