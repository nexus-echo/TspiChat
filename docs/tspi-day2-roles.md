# TSPI Digital — Day 2 role setup

LibreChat has two layers of "who sees what":

| Layer | Examples | Where TSPI sets it | Applies to |
| --- | --- | --- | --- |
| UI flags | model picker, parameters, presets, welcome text, terms | `tspi-librechat.yaml` → `interface` | Everyone, unless overridden per role in the admin panel |
| Role permissions | prompts, memories, agent builder, skills panel, MCP settings, multi-chat, people picker | MongoDB `roles` collection (USER, ADMIN) | That role only |

Role permissions are **not** in the yaml on purpose: any permission set there is re-applied to
**both** USER and ADMIN on every restart, which would lock admins out too.

## 1. Set role permissions (once)

In Coolify, open a terminal on the **mongodb** container. Copy `docs/tspi-day2-roles.mongosh.js`
there (or paste its contents into `mongosh LibreChat`), run it, then **restart the api** so the
role cache is cleared.

```bash
mongosh LibreChat tspi-day2-roles.mongosh.js
```

Result (USER covers both clinicians and patients):

| Feature | USER (clinician, patient) | ADMIN |
| --- | --- | --- |
| Chat, history, search, bookmarks, files (attach) | Yes | Yes |
| Prompts, memories, skills panel, scheduled chats | Yes | Yes |
| TSPI MCP, Web Search, Run Code, treatment-plan Skill (always on via the model spec) | Yes | Yes |
| Agent Builder | No | Yes |
| MCP Settings panel | No | Yes |
| Multi-chat | No | Yes |

Yaml side of the same change (`tspi-librechat.yaml`):

- `interface.schedules: true` switches scheduled chats on (off by default in LibreChat).
- `memory:` block gives memories a background model; it is told to save preferences only, never case data.
- `hideBadgeRow: true` on the `tspi-clinical` spec removes the Tools button and the tool chips from the
  chat box. Web Search, Run Code and TSPI MCP stay on: the server adds the spec's `webSearch`,
  `executeCode` and `mcpServers` to every request whatever the browser sends.

## 2. Give admins the model picker back (admin panel)

The model picker, parameters and presets are UI flags (`modelSelect`, `parameters`, `presets`),
switched off for everyone in the yaml. To turn them back on for admins only:

1. Open https://admin.tspipro.com and sign in as an admin.
2. Go to the configuration overrides for the **ADMIN** role.
3. Set `interface.modelSelect = true`, `interface.parameters = true`, `interface.presets = true`.
4. Save. Admins see the change after a page reload; clinicians are unaffected.

## 3. Check

| Account | Expect |
| --- | --- |
| Clinician (e.g. daphal.chaitanya84@gmail.com) or patient | Sidebar: New chat, history, search, skills, scheduled chats, prompts, memories, bookmarks, files, account. No Agent Builder, no MCP Settings. Chat box: attach button only, no Tools button or tool chips. No model picker. TSPI Digital name and logo. Terms-of-use dialog on first login. |
| Admin (chaitanya.daphal84@gmail.com) | Everything above plus Agent Builder, MCP Settings and the model picker. |
