import { TspiBrainError } from './brainClient';
import { createTspiReportPdf } from './service';
import { isValidReportId } from './report';

const ID = '0b7f3c1e-5a4d-4c1b-9a77-2d3e4f5a6b7c';

describe('createTspiReportPdf (M11/M12: the Brain makes every PDF)', () => {
  const pdf = { filename: 'TSPI-report-v1-th-2.pdf', buffer: Buffer.from('%PDF-1.7 brain') };

  it('streams the Brain PDF for a report', async () => {
    const brain = { getReportPdf: jest.fn(async () => pdf) };
    await expect(createTspiReportPdf(ID, brain)).resolves.toBe(pdf);
    expect(brain.getReportPdf).toHaveBeenCalledWith(ID);
  });

  it('maps Brain refusals to report errors', async () => {
    for (const [code, expected] of [
      ['forbidden', 'forbidden'],
      ['not_found', 'not_found'],
      ['invalid', 'invalid_id'],
      ['unavailable', 'unavailable'],
    ] as const) {
      const brain = {
        getReportPdf: jest.fn(async () => {
          throw new TspiBrainError(code, 400, 'no');
        }),
      };
      await expect(createTspiReportPdf(ID, brain)).rejects.toMatchObject({ code: expected });
    }
  });

  it('refuses v1 and malformed report ids before calling the Brain', async () => {
    const brain = { getReportPdf: jest.fn(async () => pdf) };
    for (const bad of ['0f34c5c43a2a499598bef3a73e7aeb54', '../etc', '']) {
      expect(isValidReportId(bad)).toBe(false);
      await expect(createTspiReportPdf(bad, brain)).rejects.toMatchObject({ code: 'invalid_id' });
    }
    expect(brain.getReportPdf).not.toHaveBeenCalled();
  });
});
