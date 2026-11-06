# M12 — Patient names in TspiChat: Part A checklist and cutover

Patient names may appear in TspiChat once every item below is done. Until then the TSPI Brain keeps
TspiChat `chat_safe` (patient number, sex, age band, clinic), even if its policy says `identified`:
the Brain switches only when its zero-data-retention record and the D5 acknowledgement are set.

Code changes are in this repo (branch `m12-cutover`) and in tspi-brain (`m12-cutover`).

## 1. Zero data retention (ZDR)

| Item | How | Status |
|---|---|---|
| Chat model route | OpenRouter with `provider.zdr: true` on every request (`tspi-librechat.yaml`) | code |
| OpenRouter account | OpenRouter → Settings → Privacy: turn on **Zero Data Retention** for the account (all model groups) | **ops** |
| Model | The spec's model must have ZDR endpoints on OpenRouter; with `zdr: true` requests fail rather than route to a non-ZDR host. Check the model's provider list for ZDR. | **ops** |
| Title model | `titleConvo: false` on every endpoint | code |
| Memory agent | `memory.disabled: true` | code |
| file-parser plugin | removed from the OpenRouter `addParams`; patient files go to the Brain (upload button) | code |
| Scanned-PDF OCR ("Upload as Text") | sends `provider.zdr: true` too (`visionOcr.ts`) | code |
| Record in the Brain | tspi-api env: `TSPICHAT_ZDR_PROVIDER=openrouter-zdr`, `TSPICHAT_ZDR_AGREEMENT=<OpenRouter account ZDR + provider.zdr, account id>`, `TSPICHAT_ZDR_AGREED_ON=<YYYY-MM-DD>` | **ops** |

## 2. LibreChat's own stores

| Item | How | Status |
|---|---|---|
| Disk encryption | Encrypt the host volumes for `data-node` (MongoDB), `meili_data_*`, `uploads`, `pgdata2` (RAG pgvector) and their backups (provider disk encryption or LUKS). | **ops** |
| RAG database password | `POSTGRES_PASSWORD` is now required (`deploy-compose.yml`). For the existing volume, change it inside Postgres first: `docker exec -it <vectordb> psql -U myuser -d mydatabase -c "ALTER USER myuser WITH PASSWORD '<new>';"`, and keep `POSTGRES_USER=myuser` in `.env` (a new user name only applies to a new volume). | **ops** |
| MongoDB | It runs with `--noauth` on the internal network. Not part of the M12 plan, but recommended: enable auth before real patients. | recommended |
| Search | `SEARCH=false` (forced in `deploy-compose.yml`); Meilisearch can be stopped and its volume deleted. | code |
| Retention | `interface.retentionMode: all`, `generalChatRetention: 4320` (180 days) for new chats; existing chats: `npm run tspi-retention` (dry run), then `npm run tspi-retention -- --apply`. Chats already older than 180 days are deleted within minutes of `--apply`. | code + **ops** |
| Shared links | `ALLOW_SHARED_LINKS=false`, `ALLOW_SHARED_LINKS_PUBLIC=false` (forced) | code |
| Clinical spec | no web search, no code execution, no file search; generated titles off | code |
| Web search | separate **General medical search** spec: web search, no TSPI tools, no patient context | code |
| Admin panel | `ADMIN_PANEL_ALLOWED_IPS` (Traefik ipallowlist) = the named admins' networks; only accounts with the ADMIN role can sign in (`npm run tspi-user -- set <email> --admin`). Turn on Traefik access logs for the `admin-https` router to log their access. | **ops** |

## 3. Two-factor authentication (DF10)

`tspi.require2FA: true` in `tspi-librechat.yaml`: no TSPI token for `clinic_staff`, `clinician`,
`reviewer`, `auditor` or chat admins without 2FA. Without it the chat shows "Two-factor
authentication is needed". **Before deploying, ask every clinical user to turn on 2FA**
(Settings → Account), or set `require2FA: false` for a short grace period.

## 4. Wording

Terms modal, `client/public/legal/terms.html` and `privacy.html`, the clinical `promptPrefix` and
the `tspi-treatment-plan` skill no longer say "no identifiers"; they say patient data stays in TSPI
tools and never goes into web searches. **Legal review of the two legal pages is part of the M13
legal gates.** Upload `skill/tspi-treatment-plan.zip` to Claude.ai if the skill is used there.

## 5. Switch on

Only when items 1–4, the clinical team's D5 acknowledgement and the M13 legal gates are done, in the
tspi-api environment:

```
TSPICHAT_DATA_POLICY=identified
TSPICHAT_D5_ACK_ON=<YYYY-MM-DD>
```

Check: `GET /api/v2/me` from TspiChat shows `"data_policy": "identified"`; a patient with
`identified_chat` consent shows a name in TspiChat; the same doctor through Claude.ai (WorkOS)
still sees no name.

## Part B: cutover to v2 (same release)

- The MCP has only v2 tools; `TSPI_MCP_TOOLSET` is gone (remove it from Coolify).
- TspiChat downloads only Brain (M11) PDFs; v1 report links in old chats no longer download.
- Scripted evaluation (DF11): tspi-brain `apps/tspi-mcp/eval/`; run it against the production
  model and record the result before go-live.
- `tspi_uid`: when the Brain's `python -m scripts.identity_link_status` says "ready", set
  `TSPI_MCP_JWT_LEGACY_UID=false` here.
