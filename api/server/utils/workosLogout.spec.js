const { buildWorkOSLogoutUrl, getWorkOSSessionId } = require('./workosLogout');

const jwt = (payload) =>
  ['eyJhbGciOiJSUzI1NiJ9', Buffer.from(JSON.stringify(payload)).toString('base64url'), 'sig'].join(
    '.',
  );

describe('workosLogout', () => {
  const env = { DOMAIN_CLIENT: 'https://chat.tspipro.com' };

  it('builds the WorkOS logout URL from the access token sid', () => {
    const url = new URL(
      buildWorkOSLogoutUrl({ tokens: [jwt({ sid: 'session_01ABC', sub: 'user_1' })], env }),
    );
    expect(url.origin + url.pathname).toBe(
      'https://api.workos.com/user_management/sessions/logout',
    );
    expect(url.searchParams.get('session_id')).toBe('session_01ABC');
    expect(url.searchParams.get('return_to')).toBe('https://chat.tspipro.com/login');
  });

  it('falls back to the next token and honours OPENID_POST_LOGOUT_REDIRECT_URI', () => {
    const url = new URL(
      buildWorkOSLogoutUrl({
        tokens: [undefined, 'not-a-jwt', jwt({ sid: 'session_02XYZ' })],
        env: { ...env, OPENID_POST_LOGOUT_REDIRECT_URI: 'https://chat.tspipro.com/bye' },
      }),
    );
    expect(url.searchParams.get('session_id')).toBe('session_02XYZ');
    expect(url.searchParams.get('return_to')).toBe('https://chat.tspipro.com/bye');
  });

  it('returns null without a valid sid', () => {
    expect(buildWorkOSLogoutUrl({ tokens: [jwt({ sub: 'user_1' })], env })).toBeNull();
    expect(buildWorkOSLogoutUrl({ tokens: [], env })).toBeNull();
    expect(getWorkOSSessionId(jwt({ sid: 'session_1&return_to=https://evil.example' }))).toBeNull();
  });
});
