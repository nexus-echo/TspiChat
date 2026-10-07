import { useCallback, useRef } from 'react';
import { useToastContext } from '@librechat/client';
import { dataService } from 'librechat-data-provider';
import type { UIActionResult } from '@mcp-ui/client';
import { saveBlob, getTspiPdfReportId, getAttachmentFilename } from '~/utils/tspi';
import { useOptionalMessagesOperations } from '~/Providers';
import { getResponseStatus } from '~/utils/errors';
import useLocalize from '~/hooks/useLocalize';
import { handleUIAction } from '~/utils';

type ErrorKey = 'com_ui_tspi_pdf_not_found' | 'com_ui_tspi_pdf_forbidden' | 'com_ui_tspi_pdf_error';

const errorKey = (error: unknown): ErrorKey => {
  const status = getResponseStatus(error);
  if (status === 404 || status === 400) {
    return 'com_ui_tspi_pdf_not_found';
  }
  if (status === 403) {
    return 'com_ui_tspi_pdf_forbidden';
  }
  return 'com_ui_tspi_pdf_error';
};

/**
 * Handles actions from embedded MCP UI resources. The TSPI "Download PDF" button downloads the
 * report directly; every other action is sent to the model as a message.
 */
export function useMCPUIAction() {
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { ask } = useOptionalMessagesOperations();
  const pending = useRef(new Set<string>());

  const downloadReport = useCallback(
    async (reportId: string) => {
      if (pending.current.has(reportId)) {
        return;
      }
      pending.current.add(reportId);
      showToast({ message: localize('com_ui_tspi_pdf_preparing'), status: 'info' });
      try {
        const response = await dataService.getTspiReportPdf(reportId);
        const filename = getAttachmentFilename(
          response.headers['content-disposition'],
          `TSPI_${reportId}.pdf`,
        );
        saveBlob(response.data, filename);
        showToast({ message: localize('com_ui_tspi_pdf_ready'), status: 'success' });
      } catch (error) {
        showToast({ message: localize(errorKey(error)), status: 'error' });
      } finally {
        pending.current.delete(reportId);
      }
    },
    [localize, showToast],
  );

  return useCallback(
    async (result: UIActionResult) => {
      const reportId = getTspiPdfReportId(result);
      if (reportId) {
        return downloadReport(reportId);
      }
      return handleUIAction(result, ask);
    },
    [ask, downloadReport],
  );
}
