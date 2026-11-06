/**
 * TSPI Brain REST client for TspiChat's own server routes (M04).
 *
 * The PDF download (M11 report), the Confirm / Cancel click on a pending change, and the Open click on a
 * patient do not go through the model or an MCP tool. The route calls the Brain directly with a
 * token minted for the signed-in user with `aud=tspi-api`, which the Brain accepts without the
 * MCP's service key and which no tool call can carry. The token also carries the conversation
 * (`cnv`), so a Confirm or Open applies to the chat it was clicked in.
 *
 * Configuration: TSPI_BRAIN_URL (the same setting `tspi-user` provisioning uses).
 */
import type { TspiTokenUser } from '../auth/tspiMcpToken';
import { mintTspiMcpToken } from '../auth/tspiMcpToken';

export type TspiBrainErrorCode =
  | 'not_configured'
  | 'invalid'
  | 'not_found'
  | 'forbidden'
  | 'conflict'
  | 'unavailable';

/** A Brain refusal, with the Brain's stable problem code (e.g. CONFIRMATION_EXPIRED). */
export class TspiBrainError extends Error {
  readonly code: TspiBrainErrorCode;
  readonly status: number;
  readonly problem?: string;

  constructor(code: TspiBrainErrorCode, status: number, message: string, problem?: string) {
    super(message);
    this.name = 'TspiBrainError';
    this.code = code;
    this.status = status;
    this.problem = problem;
  }
}

export interface TspiBrainClientOptions {
  baseUrl?: string;
  conversationId?: string | null;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface TspiConfirmation {
  confirmation_id: string;
  status: string;
  action_type: string;
  summary: string;
  result?: { status?: string; row_version?: number } | null;
}

/** The part of the Brain's `/api/v2/me` the chat reads. */
export interface TspiBrainMe {
  v1_role?: string;
  user_id?: string | null;
}

export interface TspiChatContext {
  conversation_id: string | null;
  patient: { id: string; patient_number: string } | null;
  opened_at: string | null;
}

export function brainUrlFromEnv(env: NodeJS.ProcessEnv = process.env): string | null {
  const url = (env.TSPI_BRAIN_URL || '').trim();
  return url ? url.replace(/\/+$/, '') : null;
}

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const SAFE_FILE = /^[A-Za-z0-9._-]{1,128}\.pdf$/;

function statusCode(status: number): TspiBrainErrorCode {
  if (status === 400 || status === 422) return 'invalid';
  if (status === 404) return 'not_found';
  if (status === 401 || status === 403) return 'forbidden';
  if (status === 409) return 'conflict';
  return 'unavailable';
}

/**
 * Declared explicitly: the package build emits declarations with `isolatedDeclarations`, so an
 * exported function needs an explicit return type.
 */
export interface TspiBrainClient {
  /** An M11 report's PDF, made and stored by the Brain. */
  getReportPdf(reportId: string): Promise<{ filename: string; buffer: Buffer }>;
  /** The Brain's view of the user (`v1_role`, memberships). */
  getMe(): Promise<TspiBrainMe>;
  /** The Open click: binds this conversation to the patient. */
  openPatient(patientId: string): Promise<TspiChatContext>;
  /** The Confirm or Cancel click on a pending change. */
  decideConfirmation(
    id: string,
    decision: 'confirm' | 'cancel',
    payloadSha256: string,
  ): Promise<TspiConfirmation>;
}

export function createTspiBrainClient(
  user: TspiTokenUser,
  options: TspiBrainClientOptions = {},
): TspiBrainClient {
  const baseUrl = options.baseUrl?.replace(/\/+$/, '') || brainUrlFromEnv();
  const doFetch = options.fetch ?? fetch;

  async function send(
    method: string,
    path: string,
    body?: unknown,
    accept = 'application/json',
  ): Promise<Response> {
    if (!baseUrl) {
      throw new TspiBrainError('not_configured', 503, 'TSPI_BRAIN_URL is not set');
    }
    const token = mintTspiMcpToken(user, Date.now(), {
      audience: 'api',
      conversationId: options.conversationId,
    });
    let res: Response;
    try {
      res = await doFetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
      });
    } catch {
      throw new TspiBrainError('unavailable', 502, 'TSPI Brain is unreachable');
    }
    if (!res.ok) {
      let problem: string | undefined;
      let detail = res.statusText;
      try {
        const data = (await res.json()) as { code?: string; detail?: unknown };
        problem = typeof data.code === 'string' ? data.code : undefined;
        if (typeof data.detail === 'string') detail = data.detail;
      } catch {
        // not JSON
      }
      // Never echo the token.
      throw new TspiBrainError(statusCode(res.status), res.status, detail, problem);
    }
    return res;
  }

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    return (await (await send(method, path, body)).json()) as T;
  }

  return {
    /**
     * An M11 report's PDF, made and stored by the Brain (WeasyPrint, English or Thai). The Brain
     * checks the audience (physician report: clinic only) and the identity projection.
     */
    getReportPdf: async (reportId: string): Promise<{ filename: string; buffer: Buffer }> => {
      if (!SAFE_ID.test(reportId)) {
        throw new TspiBrainError('invalid', 400, 'Invalid report id');
      }
      const res = await send(
        'GET',
        `/api/v2/reports/${encodeURIComponent(reportId)}/pdf`,
        undefined,
        'application/pdf',
      );
      const match = /filename="?([^";]+)"?/i.exec(res.headers.get('content-disposition') ?? '');
      const filename =
        match?.[1] && SAFE_FILE.test(match[1]) ? match[1] : `TSPI-report-${reportId}.pdf`;
      return { filename, buffer: Buffer.from(await res.arrayBuffer()) };
    },
    /** The Brain's view of the user (`v1_role`, memberships). */
    getMe: () => call<TspiBrainMe>('GET', '/api/v2/me'),
    /** The Open click: binds this conversation to the patient. */
    openPatient: (patientId: string) => {
      if (!SAFE_ID.test(patientId)) {
        return Promise.reject(new TspiBrainError('invalid', 400, 'Invalid patient id'));
      }
      return call<TspiChatContext>('PUT', '/api/v2/chat-contexts/current', {
        patient_id: patientId,
      });
    },
    /** The Confirm or Cancel click on a pending change. */
    decideConfirmation: (id: string, decision: 'confirm' | 'cancel', payloadSha256: string) => {
      if (!SAFE_ID.test(id) || !SHA256.test(payloadSha256)) {
        return Promise.reject(new TspiBrainError('invalid', 400, 'Invalid confirmation'));
      }
      return call<TspiConfirmation>('POST', `/api/v2/confirmations/${encodeURIComponent(id)}`, {
        decision,
        payload_sha256: payloadSha256,
      });
    },
  };
}
