import type { RenderablePdf, VisionOcrConfig } from './visionOcr';
import {
  buildOcrPrompt,
  getVisionOcrConfig,
  needsVisionOcr,
  ocrPageImage,
  ocrScannedPdfPages,
} from './visionOcr';

const mockPost = jest.fn();

jest.mock('@librechat/data-schemas', () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('~/utils/axios', () => ({
  createAxiosInstance: () => ({ post: mockPost }),
  logAxiosError: jest.fn(({ message }: { message: string }) => message),
}));

jest.mock('~/utils/proxy', () => ({
  applyAxiosProxyConfig: (config: object) => config,
}));

const config: VisionOcrConfig = {
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: 'test-key',
  model: 'google/gemma-4-26b-a4b-it',
  maxPages: 10,
  redactIdentifiers: false,
};

/** A fake pdfjs document whose pages "render" into their canvas a buffer naming the page. */
function fakePdf(failOnPage?: number): RenderablePdf & { destroyed: number } {
  const state = { destroyed: 0 };
  return {
    get destroyed() {
      return state.destroyed;
    },
    getPage: async (pageNumber: number) => ({
      getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
      render: ({ canvasContext }: { canvasContext: unknown }) => {
        (canvasContext as { page?: number }).page = pageNumber;
        return {
          promise:
            pageNumber === failOnPage
              ? Promise.reject(new Error('render failed'))
              : Promise.resolve(),
        };
      },
      cleanup: jest.fn(),
    }),
    canvasFactory: {
      create: () => {
        const context: { page?: number } = {};
        return { canvas: { toBuffer: () => Buffer.from(`page-${context.page}`) }, context };
      },
      destroy: () => {
        state.destroyed++;
      },
    },
  };
}

describe('getVisionOcrConfig', () => {
  it('is disabled without a model or key', () => {
    expect(getVisionOcrConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(getVisionOcrConfig({ PDF_VISION_OCR_MODEL: 'm' } as NodeJS.ProcessEnv)).toBeNull();
  });

  it('falls back to OPENROUTER_KEY and OpenRouter defaults', () => {
    expect(
      getVisionOcrConfig({
        PDF_VISION_OCR_MODEL: 'google/gemma-4-26b-a4b-it',
        OPENROUTER_KEY: 'or-key',
      } as NodeJS.ProcessEnv),
    ).toEqual({ ...config, apiKey: 'or-key' });
  });

  it('reads overrides and ignores an invalid page limit', () => {
    expect(
      getVisionOcrConfig({
        PDF_VISION_OCR_MODEL: 'm',
        PDF_VISION_OCR_API_KEY: 'own-key',
        OPENROUTER_KEY: 'or-key',
        PDF_VISION_OCR_BASEURL: 'https://example.com/v1/',
        PDF_VISION_OCR_MAX_PAGES: 'abc',
        PDF_VISION_OCR_REDACT_IDENTIFIERS: 'TRUE',
      } as NodeJS.ProcessEnv),
    ).toEqual({
      model: 'm',
      apiKey: 'own-key',
      baseURL: 'https://example.com/v1',
      maxPages: 10,
      redactIdentifiers: true,
    });
  });
});

describe('needsVisionOcr', () => {
  it('flags empty or near-empty pages only', () => {
    expect(needsVisionOcr('')).toBe(true);
    expect(needsVisionOcr('  \n Page 1 of 2 ')).toBe(true);
    expect(needsVisionOcr('Haemoglobin 13.2 g/dL reference 12-16')).toBe(false);
  });
});

describe('buildOcrPrompt', () => {
  it('only asks for redaction when enabled', () => {
    expect(buildOcrPrompt(false)).not.toContain('[REDACTED]');
    expect(buildOcrPrompt(true)).toContain('[REDACTED]');
  });
});

describe('ocrPageImage', () => {
  beforeEach(() => mockPost.mockReset());

  it('sends the page as an image with zero temperature and no-data-collection routing', async () => {
    mockPost.mockResolvedValue({
      data: { choices: [{ message: { content: ' CRP 12.4 mg/L ' } }] },
    });

    await expect(ocrPageImage(Buffer.from('png'), config)).resolves.toBe('CRP 12.4 mg/L');

    const [url, body, requestConfig] = mockPost.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(body.model).toBe('google/gemma-4-26b-a4b-it');
    expect(body.temperature).toBe(0);
    expect(body.provider).toEqual({ data_collection: 'deny' });
    expect(body.messages[0].content[1].image_url.url).toBe(
      `data:image/png;base64,${Buffer.from('png').toString('base64')}`,
    );
    expect(requestConfig.headers.Authorization).toBe('Bearer test-key');
  });

  it('omits OpenRouter routing fields for other hosts', async () => {
    mockPost.mockResolvedValue({ data: { choices: [{ message: { content: 'text' } }] } });
    await ocrPageImage(Buffer.from('png'), { ...config, baseURL: 'https://example.com/v1' });
    expect(mockPost.mock.calls[0][1].provider).toBeUndefined();
  });

  it('accepts array content, maps a blank page to empty text and rejects an empty reply', async () => {
    mockPost.mockResolvedValueOnce({
      data: { choices: [{ message: { content: [{ type: 'text', text: 'a' }, { text: 'b' }] } }] },
    });
    await expect(ocrPageImage(Buffer.from('png'), config)).resolves.toBe('ab');

    mockPost.mockResolvedValueOnce({
      data: { choices: [{ message: { content: '[blank page]' } }] },
    });
    await expect(ocrPageImage(Buffer.from('png'), config)).resolves.toBe('');

    mockPost.mockResolvedValueOnce({ data: { choices: [] } });
    await expect(ocrPageImage(Buffer.from('png'), config)).rejects.toThrow('no text');
  });
});

describe('ocrScannedPdfPages', () => {
  it('transcribes each scanned page and releases every canvas', async () => {
    const pdf = fakePdf();
    const ocrImage = jest.fn(async (image: Buffer) => `text of ${image.toString()}`);

    const result = await ocrScannedPdfPages({ pdf, pageNumbers: [2, 4], config, ocrImage });

    expect(result).toEqual(
      new Map([
        [2, 'text of page-2'],
        [4, 'text of page-4'],
      ]),
    );
    expect(pdf.destroyed).toBe(2);
  });

  it('notes pages over the limit instead of reading them', async () => {
    const ocrImage = jest.fn(async () => 'text');
    const result = await ocrScannedPdfPages({
      pdf: fakePdf(),
      pageNumbers: [1, 2, 3],
      config: { ...config, maxPages: 2 },
      ocrImage,
    });

    expect(ocrImage).toHaveBeenCalledTimes(2);
    expect(result.get(3)).toContain('over the 2-page OCR limit');
  });

  it('marks a failed page and keeps the others', async () => {
    const result = await ocrScannedPdfPages({
      pdf: fakePdf(1),
      pageNumbers: [1, 2],
      config,
      ocrImage: async () => 'text',
    });

    expect(result.get(1)).toBe('[Page 1 is a scan and could not be read]');
    expect(result.get(2)).toBe('text');
  });

  it('throws when no scanned page could be read', async () => {
    await expect(
      ocrScannedPdfPages({
        pdf: fakePdf(),
        pageNumbers: [1],
        config,
        ocrImage: async () => {
          throw new Error('model down');
        },
      }),
    ).rejects.toThrow('could not read any scanned page');
  });
});
