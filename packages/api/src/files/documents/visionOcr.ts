import { logger } from '@librechat/data-schemas';
import type { AxiosRequestConfig } from 'axios';
import { createAxiosInstance, logAxiosError } from '~/utils/axios';
import { applyAxiosProxyConfig } from '~/utils/proxy';

/**
 * Vision OCR fallback for scanned PDFs.
 *
 * The built-in parser only reads text that is embedded in a PDF. Pages that come back (nearly)
 * empty are image-only scans; when `PDF_VISION_OCR_MODEL` is set, those pages are rendered to PNG
 * and transcribed by a vision model on an OpenAI-compatible API (OpenRouter by default).
 *
 * Env:
 * - `PDF_VISION_OCR_MODEL` (required to enable), e.g. `google/gemma-4-26b-a4b-it`
 * - `PDF_VISION_OCR_API_KEY` (falls back to `OPENROUTER_KEY`)
 * - `PDF_VISION_OCR_BASEURL` (default `https://openrouter.ai/api/v1`)
 * - `PDF_VISION_OCR_MAX_PAGES` (default 10): scanned pages read per file, caps cost and time
 * - `PDF_VISION_OCR_REDACT_IDENTIFIERS` (`true` to replace patient identifiers with [REDACTED])
 *
 * Page text is never logged: uploads can hold health data.
 */

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_MAX_PAGES = 10;
const CONCURRENCY = 3;
const PAGE_TIMEOUT_MS = 90_000;
/** Render at 2x (about 144 DPI) but never wider/taller than this, to bound image tokens. */
const RENDER_SCALE = 2;
const MAX_RENDER_DIMENSION = 2000;
/** A page with fewer non-whitespace characters than this is treated as a scan. */
export const MIN_PAGE_TEXT_CHARS = 20;

export interface VisionOcrConfig {
  baseURL: string;
  apiKey: string;
  model: string;
  maxPages: number;
  redactIdentifiers: boolean;
}

/** Minimal slice of the pdfjs document API used for rendering (keeps this module testable). */
interface RenderablePage {
  getViewport(params: { scale: number }): { width: number; height: number };
  render(params: { canvasContext: unknown; viewport: unknown }): { promise: Promise<unknown> };
  cleanup?(): unknown;
}

interface CanvasAndContext {
  canvas: { toBuffer(mime: 'image/png'): Buffer } | null;
  context: unknown;
}

export interface RenderablePdf {
  getPage(pageNumber: number): Promise<RenderablePage>;
  canvasFactory: {
    create(width: number, height: number): CanvasAndContext;
    destroy(canvasAndContext: CanvasAndContext): void;
  };
}

export function getVisionOcrConfig(env: NodeJS.ProcessEnv = process.env): VisionOcrConfig | null {
  const model = env.PDF_VISION_OCR_MODEL?.trim();
  const apiKey = (env.PDF_VISION_OCR_API_KEY || env.OPENROUTER_KEY)?.trim();
  if (!model || !apiKey) {
    return null;
  }
  const maxPages = Number.parseInt(env.PDF_VISION_OCR_MAX_PAGES ?? '', 10);
  return {
    model,
    apiKey,
    baseURL: (env.PDF_VISION_OCR_BASEURL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, ''),
    maxPages: Number.isFinite(maxPages) && maxPages > 0 ? maxPages : DEFAULT_MAX_PAGES,
    redactIdentifiers: env.PDF_VISION_OCR_REDACT_IDENTIFIERS?.trim().toLowerCase() === 'true',
  };
}

/** True when a page's embedded text is too thin to be the real content (an image-only scan). */
export function needsVisionOcr(pageText: string): boolean {
  return pageText.replace(/\s/g, '').length < MIN_PAGE_TEXT_CHARS;
}

export function buildOcrPrompt(redactIdentifiers: boolean): string {
  const lines = [
    'Transcribe all text on this scanned document page exactly as printed.',
    '- Keep every number, decimal point, unit, reference range and flag (H/L, high/low) exactly.',
    '- Write tables as Markdown tables, keeping each value in its own row and column.',
    '- Keep the reading order of the page. Do not summarise, interpret, correct or add anything.',
    '- If a word or value is illegible, write [illegible] in its place. Never guess a number.',
    '- If the page has no text, reply with [blank page].',
  ];
  if (redactIdentifiers) {
    lines.push(
      "- Replace the patient's name, date of birth, record/MRN/ID numbers, phone, email and address",
      '  with [REDACTED]. Keep everything else, including test dates, age, sex and lab names.',
    );
  }
  lines.push('Reply with the transcription only.');
  return lines.join('\n');
}

function extractMessageText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === 'object' && typeof (part as { text?: unknown }).text === 'string'
          ? (part as { text: string }).text
          : '',
      )
      .join('');
  }
  return '';
}

/** Sends one page image to the vision model and returns its transcription. */
export async function ocrPageImage(image: Buffer, config: VisionOcrConfig): Promise<string> {
  const url = `${config.baseURL}/chat/completions`;
  const body: Record<string, unknown> = {
    model: config.model,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: buildOcrPrompt(config.redactIdentifiers) },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${image.toString('base64')}` },
          },
        ],
      },
    ],
  };
  if (/(^|\.)openrouter\.ai$/i.test(new URL(url).hostname)) {
    /* Health data: only route to providers that neither store nor train on prompts. */
    body.provider = { data_collection: 'deny' };
  }

  const requestConfig: AxiosRequestConfig = applyAxiosProxyConfig(
    {
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      timeout: PAGE_TIMEOUT_MS,
    },
    url,
  );
  const response = await createAxiosInstance().post(url, body, requestConfig);
  const text = extractMessageText(response.data?.choices?.[0]?.message?.content).trim();
  if (!text) {
    throw new Error('Vision OCR returned no text');
  }
  return text === '[blank page]' ? '' : text;
}

async function renderPageToPng(pdf: RenderablePdf, pageNumber: number): Promise<Buffer> {
  const page = await pdf.getPage(pageNumber);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(RENDER_SCALE, MAX_RENDER_DIMENSION / Math.max(base.width, base.height, 1));
  const viewport = page.getViewport({ scale });
  const canvasAndContext = pdf.canvasFactory.create(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );
  try {
    await page.render({ canvasContext: canvasAndContext.context, viewport }).promise;
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas unavailable for PDF rendering');
    }
    return canvasAndContext.canvas.toBuffer('image/png');
  } finally {
    pdf.canvasFactory.destroy(canvasAndContext);
    page.cleanup?.();
  }
}

/**
 * Renders and transcribes the given (1-based) pages. Returns text per page number.
 * Pages over the limit, and pages that fail, get a bracketed note so the model knows text is
 * missing rather than silently seeing a shorter report.
 *
 * @throws {Error} if every page it attempted failed.
 */
export async function ocrScannedPdfPages({
  pdf,
  pageNumbers,
  config,
  ocrImage = ocrPageImage,
}: {
  pdf: RenderablePdf;
  pageNumbers: number[];
  config: VisionOcrConfig;
  ocrImage?: (image: Buffer, config: VisionOcrConfig) => Promise<string>;
}): Promise<Map<number, string>> {
  const results = new Map<number, string>();
  const attempted = pageNumbers.slice(0, config.maxPages);
  for (const pageNumber of pageNumbers.slice(config.maxPages)) {
    results.set(
      pageNumber,
      `[Page ${pageNumber} is a scan and was not read: over the ${config.maxPages}-page OCR limit]`,
    );
  }

  let failures = 0;
  let next = 0;
  const worker = async () => {
    while (next < attempted.length) {
      const pageNumber = attempted[next++];
      try {
        const image = await renderPageToPng(pdf, pageNumber);
        results.set(pageNumber, await ocrImage(image, config));
      } catch (error) {
        failures++;
        logAxiosError({ error, message: `[visionOcr] Page ${pageNumber} could not be read` });
        results.set(pageNumber, `[Page ${pageNumber} is a scan and could not be read]`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, attempted.length) }, worker));

  if (attempted.length > 0 && failures === attempted.length) {
    throw new Error('Vision OCR could not read any scanned page of this PDF');
  }
  logger.info(
    `[visionOcr] Transcribed ${attempted.length - failures}/${pageNumbers.length} scanned PDF page(s) with ${config.model}`,
  );
  return results;
}
