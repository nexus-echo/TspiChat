import { inflateSync } from 'zlib';
import type { TspiPlanRecord } from './types';
import {
  TspiReportError,
  getApproval,
  parsePlanRecord,
  parseViewer,
  reportFileName,
} from './report';
import { hiddenPlanText, labStatus, renderReportPdf, toPdfText, unmappedLabRows } from './pdf';
import { createTspiReportPdf, TSPI_TOOLS } from './service';

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
      unmapped_labs: [
        {
          analyte: 'Zonulin',
          value: 120,
          unit: 'ng/mL',
          reason: 'UNKNOWN_ANALYTE',
          detail: 'Not in the TSPI marker registry, so TSPI cannot interpret it.',
        },
      ],
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
    expect(toPdfText('🚩 Red flag')).toBe('(!) Red flag');
  });
});

describe('lab usage in the PDF', () => {
  it('lists the labs the engine did not use for scoring, with the reason', () => {
    expect(
      unmappedLabRows([
        {
          analyte: 'Zonulin',
          value: 120,
          unit: 'ng/mL',
          reason: 'UNKNOWN_ANALYTE',
          detail: 'Not in the registry.',
        },
        {
          analyte: 'Ferritin',
          value: 600,
          unit: 'ng/mL',
          flag: 'high',
          reason: 'AMBIGUOUS_CONTEXT',
        },
      ]),
    ).toEqual([
      ['Zonulin=120ng/mL', 'Not in the registry.'],
      ['Ferritin=600ng/mL (high)', 'Ambiguous context'],
    ]);
  });

  it('labels each signal with how the engine used it', () => {
    const unmapped = [{ analyte: 'LDL', reason: 'NO_AXIS_MAPPING' }];
    const ldl = {
      concept: 'lipid / lipotoxicity',
      direction: 'up',
      source: 'LDL=190.0mg/dL (high)',
    };
    const crp = {
      concept: 'systemic inflammation',
      direction: 'normal',
      source: 'CRP=1.0mg/L (normal)',
    };
    const tsh = { concept: 'thyroid axis', direction: 'up', source: 'TSH=8.81uIU/mL (high)' };
    expect(labStatus(ldl, unmapped)).toBe('Not scored');
    expect(labStatus(crp, unmapped)).toBe('Normal (not scored)');
    expect(labStatus({ concept: 'lab:LDH', source: 'LDH=264.0U/L (n/a)' })).toBe('Not recognised');
    expect(labStatus(tsh, unmapped)).toBe('Used');
  });
});

/** The text a pdfkit PDF draws: inflates each content stream and decodes its TJ strings. */
const pdfText = (pdf: Buffer): string => {
  const out: string[] = [];
  for (const m of pdf.toString('latin1').matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1');
    } catch {
      continue;
    }
    for (const tj of content.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
      const hex = [...tj[1].matchAll(/<([0-9a-fA-F]*)>/g)].map((h) => h[1]).join('');
      out.push(Buffer.from(hex, 'hex').toString('latin1'));
    }
  }
  return out.join('\n');
};

/** A draft as the engine returns it to a patient: modules and doses withheld (M00 task 4). */
const patientView = (): TspiPlanRecord => {
  const plan = basePlan();
  plan.payload = {
    ...plan.payload,
    modules: [],
    report_markdown: '## Your plan\n\n- Your treatment plan is not shown yet.',
    safety_alerts: [
      { severity: 'red_flag', reason: 'RED FLAG [CLASS_1_EMERGENCY] Critical potassium' },
    ],
    plan_hidden: true,
    plan_hidden_reason: 'awaiting_doctor_review',
  };
  return plan;
};

describe('patient view of a plan (analysis only until approval)', () => {
  it('renders a withheld plan without modules or doses', async () => {
    const text = pdfText(await renderReportPdf(patientView(), { role: 'patient' }));
    expect(text).toContain('UNREVIEWED AI ANALYSIS');
    expect(text).toContain('Your treatment plan');
    expect(text).toContain('Critical potassium'); // red flags stay, with their text
    expect(text).not.toContain('H-030');
    expect(text).not.toContain('caps x');
    // the approved plan shows its modules, so the text check above can see them
    expect(pdfText(await renderReportPdf(approvedPlan(), { role: 'patient' }))).toContain('H-030');
  });

  it('says why the plan is withheld', () => {
    expect(hiddenPlanText('awaiting_doctor_review')).toContain('after a TSPI doctor reviews');
    expect(hiddenPlanText('release_blocked')).toContain('cannot be released yet');
    expect(hiddenPlanText('rejected')).toContain('did not approve');
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
