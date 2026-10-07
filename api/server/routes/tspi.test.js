const express = require('express');
const request = require('supertest');

const mockCallTool = jest.fn();

jest.mock('@librechat/api', () => ({
  ...jest.requireActual('@librechat/api'),
  generateCheckAccess: jest.fn(() => (_req, _res, next) => next()),
}));
jest.mock('~/server/middleware', () => ({
  requireJwtAuth: (req, _res, next) => {
    req.user = { id: 'user-1', role: 'USER' };
    next();
  },
  configMiddleware: (_req, _res, next) => next(),
}));
jest.mock('~/server/services/OpenIDSessionRefresh', () => ({
  createOpenIDSessionTokenProvider: jest.fn(() => null),
}));
jest.mock('~/config', () => ({
  getMCPManager: () => ({ callTool: (...args) => mockCallTool(...args) }),
  getFlowStateManager: jest.fn(() => ({})),
}));
jest.mock('~/cache', () => ({ getLogStores: jest.fn(() => ({})) }));
jest.mock('~/models', () => ({ getRoleByName: jest.fn() }));

const REPORT_ID = '0f34c5c43a2a499598bef3a73e7aeb54';
const plan = {
  id: REPORT_ID,
  case_id: 'TSPI-261008-0214-01',
  status: 'draft',
  payload: { report_markdown: '### Overview\n* item', modules: [] },
};

const app = express();
app.use('/api/tspi', require('./tspi'));

describe('GET /api/tspi/reports/:reportId/pdf', () => {
  beforeEach(() => mockCallTool.mockReset());

  it('returns a PDF built from the user’s TSPI tool call', async () => {
    mockCallTool.mockImplementation(async ({ toolName }) =>
      toolName === 'tspi_whoami'
        ? ['{"identity":{"role":"clinician"}}', undefined]
        : [JSON.stringify(plan), undefined],
    );

    const res = await request(app).get(`/api/tspi/reports/${REPORT_ID}/pdf`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toContain(
      `TSPI_TSPI-261008-0214-01_${REPORT_ID}_DRAFT.pdf`,
    );
    expect(mockCallTool).toHaveBeenCalledWith(
      expect.objectContaining({
        serverName: 'tspi',
        toolName: 'tspi_get_treatment_plan',
        toolArguments: { report_id: REPORT_ID },
        user: expect.objectContaining({ id: 'user-1' }),
      }),
    );
  });

  it('maps engine errors to HTTP statuses', async () => {
    mockCallTool.mockResolvedValue(['{"error":"Report not found"}', undefined]);
    const res = await request(app).get(`/api/tspi/reports/${REPORT_ID}/pdf`);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });

  it('returns 502 when the MCP call fails', async () => {
    mockCallTool.mockRejectedValue(new Error('connection refused'));
    const res = await request(app).get(`/api/tspi/reports/${REPORT_ID}/pdf`);
    expect(res.status).toBe(502);
  });
});
