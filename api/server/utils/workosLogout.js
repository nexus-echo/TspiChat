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

module.exports = { buildWorkOSLogoutUrl, getWorkOSSessionId, decodeJwtPayload };
