import React from 'react';
import axios from 'axios';
import { ToastContext } from '@librechat/client';
import { renderHook, act } from '@testing-library/react';
import { useMCPUIAction } from '../useMCPUIAction';

const mockAsk = jest.fn();
jest.mock('~/Providers', () => ({
  useOptionalMessagesOperations: () => ({ ask: mockAsk }),
}));

const REPORT_ID = '0f34c5c43a2a499598bef3a73e7aeb54';
const pdfClick = {
  type: 'prompt' as const,
  payload: { prompt: `Create and give me the PDF for report ${REPORT_ID}` },
};

describe('useMCPUIAction', () => {
  const showToast = jest.fn();
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ToastContext.Provider value={{ showToast }}>{children}</ToastContext.Provider>
  );

  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    URL.createObjectURL = jest.fn(() => 'blob:report');
    URL.revokeObjectURL = jest.fn();
  });

  it('downloads the TSPI PDF directly instead of asking the model', async () => {
    const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const download = jest.spyOn(axios, 'get').mockResolvedValue({
      data: new Blob(['%PDF-'], { type: 'application/pdf' }),
      headers: { 'content-disposition': 'attachment; filename="TSPI_A_B_DRAFT.pdf"' },
    });

    const { result } = renderHook(() => useMCPUIAction(), { wrapper });
    await act(() => result.current(pdfClick));

    expect(download).toHaveBeenCalledWith(
      expect.stringContaining(`/api/tspi/reports/${REPORT_ID}/pdf`),
      expect.objectContaining({ responseType: 'blob' }),
    );
    expect(click).toHaveBeenCalledTimes(1);
    expect(mockAsk).not.toHaveBeenCalled();
    expect(showToast).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'success' }));
  });

  it('shows a not-found message when the server cannot find the report', async () => {
    jest
      .spyOn(axios, 'get')
      .mockRejectedValue(Object.assign(new Error('Not Found'), { status: 404 }));

    const { result } = renderHook(() => useMCPUIAction(), { wrapper });
    await act(() => result.current(pdfClick));

    expect(showToast).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'error', message: expect.stringContaining('not found') }),
    );
    expect(mockAsk).not.toHaveBeenCalled();
  });

  it('sends every other button to the model', async () => {
    const download = jest.spyOn(axios, 'get');
    const { result } = renderHook(() => useMCPUIAction(), { wrapper });
    await act(() =>
      result.current({
        type: 'prompt',
        payload: { prompt: 'Generate the TSPI report for case X' },
      }),
    );

    expect(download).not.toHaveBeenCalled();
    expect(mockAsk).toHaveBeenCalledTimes(1);
  });
});
