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

Result:

| Feature | USER (clinician) | ADMIN |
| --- | --- | --- |
| Chat, history, search, bookmarks, files | Yes | Yes |
| TSPI MCP tools, treatment-plan Skill (applied automatically) | Yes | Yes |
| Prompts, memories, multi-chat | No | Yes |
| Agent Builder | No | Yes |
| Skills panel (authoring) | No | Yes |
| MCP Settings panel | No | Yes |

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
| Clinician (e.g. daphal.chaitanya84@gmail.com) | Sidebar: New chat, history, search, bookmarks, files, account. No Agent Builder, Skills, MCP Settings, Prompts, Memories. No model picker. TSPI Digital name and logo. Terms-of-use dialog on first login. |
| Admin (chaitanya.daphal84@gmail.com) | Everything above plus Agent Builder, Skills, MCP Settings, Prompts, Memories, and the model picker. |
