/**
 * TSPI: full WorkOS (AuthKit) sign-out.
 *
 * WorkOS does not publish an OIDC `end_session_endpoint`, so LibreChat's standard RP-initiated
 * logout never reaches it and the AuthKit session cookie survives a chat sign-out (the next
 * "Continue" signs the same user straight back in). WorkOS ends a session with
 *   GET https://api.workos.com/user_management/sessions/logout?session_id=<sid>&return_to=<url>
 * where `sid` is a claim of the WorkOS access token. `return_to` must be listed in the WorkOS
 * environment's logout URIs.
 *
 * Enabled with OPENID_WORKOS_LOGOUT=true. Optional:
 *   OPENID_WORKOS_LOGOUT_URL       (default https://api.workos.com/user_management/sessions/logout)
 *   OPENID_POST_LOGOUT_REDIRECT_URI (default ${DOMAIN_CLIENT}/login)
 */
const DEFAULT_WORKOS_LOGOUT_URL = 'https://api.workos.com/user_management/sessions/logout';

/** Reads the payload of a JWT without verifying it (the token came from our own session). */
function decodeJwtPayload(token) {
  if (typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString(
      'utf8',
    );
    const payload = JSON.parse(json);
    return payload && typeof payload === 'object' ? payload : null;
  } catch {
    return null;
  }
}

/** Returns the first WorkOS session id (`sid` claim) found in the given tokens. */
function getWorkOSSessionId(...tokens) {
  for (const token of tokens) {
    const sid = decodeJwtPayload(token)?.sid;
    if (typeof sid === 'string' && /^session_[A-Za-z0-9]+$/.test(sid)) {
      return sid;
    }
  }
  return null;
}

/**
 * Builds the WorkOS logout URL, or null when no session id is available.
 * @param {{ tokens: Array<string|undefined>, returnTo?: string, env?: NodeJS.ProcessEnv }} params
 */
function buildWorkOSLogoutUrl({ tokens, returnTo, env = process.env }) {
  const sessionId = getWorkOSSessionId(...(tokens || []));
  if (!sessionId) {
    return null;
  }
  const url = new URL(env.OPENID_WORKOS_LOGOUT_URL || DEFAULT_WORKOS_LOGOUT_URL);
  url.searchParams.set('session_id', sessionId);
  const target =
    returnTo ||
    env.OPENID_POST_LOGOUT_REDIRECT_URI ||
    (env.DOMAIN_CLIENT ? `${env.DOMAIN_CLIENT}/login` : '');
  if (target) {
    url.searchParams.set('return_to', target);
  }
  return url.toString();
}

/**
 * TSPI: WorkOS OAuth-app sign-ins (TSPI Chat) create no WorkOS user session, so there is no `sid`
 * and nothing for the logout endpoint to end; the AuthKit cookie then signs the user straight back
 * in. Instead, chat sign-out sets this short-lived cookie and the next authorization request adds
 * `prompt=login`, which makes AuthKit ask for credentials again (verified on the AuthKit domain).
 * Enabled with OPENID_FORCE_LOGIN_AFTER_LOGOUT=true.
 */
const REAUTH_COOKIE = 'tspi_reauth';
const REAUTH_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function reauthCookieOptions(env = process.env) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: (env.DOMAIN_SERVER || '').startsWith('https://'),
    maxAge: REAUTH_COOKIE_MAX_AGE_MS,
    path: '/',
  };
}

module.exports = {
  buildWorkOSLogoutUrl,
  getWorkOSSessionId,
  decodeJwtPayload,
  REAUTH_COOKIE,
  reauthCookieOptions,
};
