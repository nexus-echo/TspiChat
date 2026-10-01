# TSPI Digital — Day 1 runbook (access and model)

Goal for today: a clinician signs in to chat.tspipro.com once with WorkOS, and the TSPI MCP
recognises them as themselves (Gate A: `tspi_whoami` returns each user's own identity).

## What is already done in code

| Repo | File | Change |
| --- | --- | --- |
| TspiChat | `tspi-librechat.yaml` | TSPI MCP with per-user bearer token, Anthropic endpoint, one locked model spec (`claude-sonnet-5-5`), model picker off. Validated against LibreChat's config schema. |
| TspiChat | `.env.tspi.example` | Every env var to add in Coolify (WorkOS login, roles, API key). |
| tspi_new | `apps/tspi-mcp/tspi_mcp/config.py`, `identity.py` | Opt-in acceptance of tokens from the chat app (see "Why the MCP needed a change"). Default behaviour unchanged when the new vars are empty. |
| tspi_new | `apps/tspi-mcp/tspi_mcp/identity.py` | Security fix: a signed-in user with no `role` in WorkOS metadata now gets `unassigned` instead of silently falling back to the pilot `clinician` role (public sign-up is on, so anyone could have used the Claude connector as a clinician). |
| tspi_new | `apps/tspi-mcp/tests/test_identity_first_party.py` | 6 tests (all pass): Claude connector tokens still work; chat tokens accepted; other apps, wrong issuer, wrong audience rejected. |
| tspi_new | `apps/tspi-mcp/.env.example` | Documents the two new vars. |

### Why the MCP needed a change

The MCP only accepts tokens whose audience is `https://mcp.tspipro.com/mcp` (the Claude connector
asks WorkOS for exactly that). When LibreChat logs a user in, WorkOS issues a token whose audience
is the **environment client ID** instead, so the MCP would answer 401. The patch accepts that
audience **only** when the token's `client_id` is the TSPI Digital chat app.

## Step 1 — WorkOS (project TSPI_MCP, Staging environment) — checked 30 Sep via the WorkOS MCP

| Item | State |
| --- | --- |
| App **TSPI Chat** | First-party, confidential, `client_01M3NRNPC8JQT18S8BH938EAT9`, 1 secret (ends `c956d286`) |
| Redirect URIs | Fixed on 30 Sep: was `ttps://…` (missing "h"). Now `https://chat.tspipro.com/oauth/openid/callback` (default) and `https://chat.tspipro.com/api/admin/oauth/openid/callback` |
| Environment client ID | `client_01M24VD2E06DHEPBA33GD9X0NS` (goes in `TSPI_EXTRA_AUDIENCES`) |
| MCP resource indicator | `https://mcp.tspipro.com/mcp` (unchanged) |
| JWT template | `role` and `clinic_id` come from **user metadata**, plus email and names |

**Roles live in user metadata, not in WorkOS organization roles.** To make someone a clinician,
set metadata `role=clinician` and `clinic_id=<clinic>` on the user (Users, user, Metadata).
Chat admin rights come from a separate metadata key `app_role=admin` (JWT template claim
`app_role`, added 1 Oct), so one person can be clinician and admin together. An admin who is not
a clinician (IT) gets `role=admin` + `app_role=admin`. Organization membership and the Member/Admin org roles do not
affect the chat or the MCP.

Users today:

| User | Metadata role | Clinic | Note |
| --- | --- | --- | --- |
| chaitanya.daphal84@gmail.com | clinician + `app_role=admin` | city_hospital | Member of Test Clinic and TSPI Platform, so AuthKit may ask which org at login; either works |
| tspi.clinician@tspipro.com | clinician | tspi_clinic | Never signed in; email not verified (verification code goes to that mailbox) |
| (IT admin account) | admin + `app_role=admin` | none | Not created yet |

Recommended: turn off public sign-up (AuthKit, Authentication, "Allow sign-up") so only invited
users get accounts. LibreChat and the patched MCP already reject users without a role.

## Step 2 — TSPI MCP (mcp.tspipro.com), about 15 min

1. Deploy the patched `apps/tspi-mcp` code.
2. Add these env vars in Coolify and restart:

```
TSPI_EXTRA_AUDIENCES=client_01M24VD2E06DHEPBA33GD9X0NS
TSPI_ALLOWED_CLIENT_IDS=client_01M3NRNPC8JQT18S8BH938EAT9
```

3. Check the Claude connector still works (run `tspi_whoami` from Claude). It must be unchanged.

## Step 3 — LibreChat (chat.tspipro.com), about 20 min

1. Add the vars from `.env.tspi.example` to the Coolify `.env` with the real values
   (client ID, secret, a new random `OPENID_SESSION_SECRET`, a paid Anthropic API key).
2. Commit and push `tspi-librechat.yaml` to `main`. The API reads it from GitHub raw
   (`CONFIG_PATH`), which can cache for a few minutes.
3. Redeploy the `api` service and check its log for config errors.

## Step 4 — Gate A checks

| # | Test | Expected |
| --- | --- | --- |
| 1 | Open chat.tspipro.com | Redirects straight to WorkOS login |
| 2 | Log in as clinician A | Chat opens on "TSPI Clinical Assistant"; no model picker |
| 3 | Ask: "Run tspi_whoami" | Clinician A's own name, email, role `clinician`, clinic |
| 4 | Log out, log in as clinician B, repeat | Clinician B's identity, not A's |
| 5 | Log in with a user who has neither `clinician` nor `admin` | "You must have one of: clinician, admin role to log in." |
| 6 | Log in as admin | Admin menu available (full admin screen is configured on Day 2) |

Note: an `admin` account is not a valid engine role, so TSPI tools refuse it by design. Test the
tools with clinician accounts.

## If a check fails

| Symptom | Where to look | Fix |
| --- | --- | --- |
| Login error "You must have one of: clinician, admin role" | WorkOS user metadata | Set metadata `role` on that user |
| MCP tools fail with 401 / reconnect loop | MCP log: `audience mismatch (got 'X' ...)` | Put `X` in `TSPI_EXTRA_AUDIENCES` |
| MCP log: `client_id 'Y' is not an allowed first-party app` | MCP log | Put `Y` in `TSPI_ALLOWED_CLIENT_IDS` |
| Tools missing in chat | LibreChat api log for MCP connection errors | Check `OPENID_REUSE_TOKENS=true` and that the user logged in after the change |
| Config ignored | LibreChat api log at startup | Wait for GitHub raw cache, then restart `api` |
