import type { TspiPlanRecord } from './types';
import {
  TspiReportError,
  getApproval,
  parsePlanRecord,
  parseViewer,
  reportFileName,
} from './report';
import { createTspiReportPdf, TSPI_TOOLS } from './service';
import { toPdfText } from './pdf';

const basePlan = (overrides: Partial<TspiPlanRecord> = {}): TspiPlanRecord => ({
  id: '0f34c5c43a2a499598bef3a73e7aeb54',
  case_id: 'TSPI-261008-0214-01',
  status: 'draft',
  nss: 96,
  severity_level: 3,
  payload: {
    report_markdown: '### **Clinical Overview**\n* **TSH:** 8.81 μIU/mL\n  * nested NF-κB item',
    red_flag_screen: { screened: true, red_flags: [], critical_values: [] },
    analysis: {
      severity_name: 'Advanced Network Failure',
      signals: [
        { concept: 'thyroid axis', source: 'TSH=8.81μIU/mL (high)', evidence_status: 'MEASURED' },
        { concept: 'lab:LDH', source: 'LDH=264.0U/L (n/a)', evidence_status: 'MEASURED' },
      ],
      axis_scores: [{ axis_code: 'A33', axis_name: 'Thyroid', score: 100, status: 'ASSESSED' }],
    },
    modules: [{ module_code: 'H-030', module_name: 'IM-6 Capsule', dose: '3 caps x 5/day' }],
    monitoring: [{ reassess_every_days: [14, 30] }],
    pilot_notice: 'PILOT — PROVISIONAL',
  },
  ...overrides,
});

const approvedPlan = (): TspiPlanRecord => {
  const plan = basePlan({ status: 'validated', deliverable: true });
  plan.payload.approved_by = {
    name: 'Dr Test',
    at: '2026-10-07T20:56:29.525558',
    decision: 'approve',
  };
  return plan;
};

describe('TSPI report parsing', () => {
  it('parses the engine JSON even when other text blocks follow it', () => {
    const text = `${JSON.stringify(basePlan())}\n\nResource URI: ui://tspi/actions`;
    expect(parsePlanRecord(text).case_id).toBe('TSPI-261008-0214-01');
  });

  it('maps engine errors to typed report errors', () => {
    expect(() => parsePlanRecord('{"error":"Report not found"}')).toThrow(
      expect.objectContaining({ code: 'not_found' }),
    );
    expect(() => parsePlanRecord('Error: forbidden for this clinic')).toThrow(
      expect.objectContaining({ code: 'forbidden' }),
    );
    expect(() => parsePlanRecord('')).toThrow(TspiReportError);
  });

  it('reads the caller role from whoami', () => {
    expect(parseViewer('{"identity":{"role":"Patient"}}').role).toBe('patient');
    expect(parseViewer('not json').role).toBe('');
  });

  it('uses the top-level engine status for approval and the file name', () => {
    expect(getApproval(basePlan())).toBe('draft');
    expect(getApproval(approvedPlan())).toBe('approved');
    expect(getApproval(basePlan({ status: 'rejected' }))).toBe('rejected');
    expect(reportFileName(basePlan())).toBe(
      'TSPI_TSPI-261008-0214-01_0f34c5c43a2a499598bef3a73e7aeb54_DRAFT.pdf',
    );
    expect(reportFileName(approvedPlan())).toMatch(/_APPROVED\.pdf$/);
  });

  it('keeps PDF text inside the built-in font encoding', () => {
    expect(toPdfText('8.81 μIU/mL NF-κB ≥ 5 – ok')).toBe('8.81 uIU/mL NF-kB >= 5 – ok');
    expect(toPdfText('ภาวะ')).toBe('????');
  });
});

describe('createTspiReportPdf', () => {
  it('renders a PDF from the engine output for the given report', async () => {
    const calls: string[] = [];
    const file = await createTspiReportPdf(
      '0f34c5c43a2a499598bef3a73e7aeb54',
      async (tool, args) => {
        calls.push(tool);
        if (tool === TSPI_TOOLS.whoami) {
          return '{"identity":{"role":"patient"}}';
        }
        expect(args).toEqual({ report_id: '0f34c5c43a2a499598bef3a73e7aeb54' });
        return JSON.stringify(approvedPlan());
      },
    );
    expect(calls.sort()).toEqual([TSPI_TOOLS.getTreatmentPlan, TSPI_TOOLS.whoami].sort());
    expect(file.filename).toMatch(/_APPROVED\.pdf$/);
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(file.buffer.length).toBeGreaterThan(2000);
  });

  it('still renders when whoami fails', async () => {
    const file = await createTspiReportPdf('abc123', async (tool) => {
      if (tool === TSPI_TOOLS.whoami) {
        throw new Error('down');
      }
      return JSON.stringify(basePlan({ id: 'abc123' }));
    });
    expect(file.filename).toMatch(/_DRAFT\.pdf$/);
  });

  it('rejects malformed report ids before calling the engine', async () => {
    const callTool = jest.fn();
    await expect(createTspiReportPdf('../etc', callTool)).rejects.toMatchObject({
      code: 'invalid_id',
    });
    expect(callTool).not.toHaveBeenCalled();
  });
});
