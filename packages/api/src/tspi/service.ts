import type { TspiReportFile, TspiToolCaller } from './types';
import {
  TspiReportError,
  isValidReportId,
  parsePlanRecord,
  parseViewer,
  reportFileName,
} from './report';
import { renderReportPdf } from './pdf';

/** Upstream tool names on the TSPI MCP server (the model sees them as `<name>_mcp_tspi`). */
export const TSPI_TOOLS = {
  getTreatmentPlan: 'tspi_get_treatment_plan',
  whoami: 'tspi_whoami',
} as const;

/**
 * Builds the treatment-plan PDF for one report straight from TSPI Brain, without the model.
 * The engine authorizes the read with the caller's own token, so a report the user cannot
 * open surfaces here as `forbidden` or `not_found`.
 */
export const createTspiReportPdf = async (
  reportId: string,
  callTool: TspiToolCaller,
): Promise<TspiReportFile> => {
  if (!isValidReportId(reportId)) {
    throw new TspiReportError('invalid_id', 'Invalid report id');
  }
  const [planText, whoamiText] = await Promise.all([
    callTool(TSPI_TOOLS.getTreatmentPlan, { report_id: reportId }),
    callTool(TSPI_TOOLS.whoami, {}).catch(() => ''),
  ]);
  const plan = parsePlanRecord(planText);
  const viewer = parseViewer(whoamiText);
  const buffer = await renderReportPdf(plan, viewer);
  return { filename: reportFileName(plan), buffer };
};
