# Local development — how to start the application

> **Location:** `docs/local-startup.md` — fork-specific notes. (Upstream docs live under `packages/docs/`.)

All commands assume a **terminal at the repository root**, **Node.js ≥ 22**, and **Yarn 4** (see root `package.json` / `packageManager`).

---

## One-time or occasional setup

| Situation                                                                              | What to run                       |
| -------------------------------------------------------------------------------------- | --------------------------------- |
| **New clone or dependencies changed**                                                  | `yarn install`                    |
| **Husky / git hooks** (if you use them)                                                | `yarn prepare` once after install |
| **Assistant or Node `@actual-app/api` fails** (missing or broken `packages/api/dist/`) | `yarn build:api`                  |
| **Official CLI** (`actual …` via Yarn)                                                 | `yarn build:cli`                  |

---

## Scenarios — pick one

### A. Web app + sync server (typical for multi-device sync and API/CLI)

Use this when you want the **browser UI** and the **sync server** together (e.g. testing login, sync id, assistant, or CLI against a local server).

```bash
yarn start:server-dev
```

- Leave this process running.
- **Sync server** is usually at **http://localhost:5006** (API/UI may open or link there depending on env).
- **Vite dev server** for the web client is usually at **http://localhost:3001** — use the URL your terminal or browser shows if it differs.
- First load can take a moment while plugins and bundles come up.

---

### B. Web app only (no sync server)

Use this for **local-only** work in the browser without running the sync server process.

```bash
yarn start
```

Same idea: keep the terminal open; open the printed **localhost** URL (often port **3001**).

---

### C. Sync server only

Rare for day-to-day UI work; useful if something else is already serving the frontend.

```bash
yarn start:server
```

You still need a way to load the client (another dev server or a static build).

---

### D. Desktop (Electron) development

Use this when you work on the **Electron shell** or desktop-specific behavior.

```bash
yarn start:desktop
```

This runs prerequisite builds/watchers (`desktop-dependencies` plus parallel desktop tasks). It is **heavier** than browser-only dev. See `AGENTS.md` for package layout.

---

### E. Documentation site

```bash
yarn start:docs
```

Serves the Docusaurus site for `packages/docs/` (port depends on Docusaurus config).

---

### F. Assistant (spike / poll) or CLI (Node, not the browser)

These use **`@actual-app/api`** in Node — **not** a replacement for opening the web app.

1. Ensure **`yarn build:api`** has been run at least once (or after a clean).
2. Optional: **`yarn build:cli`** if you use the `actual` CLI via Yarn.
3. From the repo root, set connection details via **`actual.config.json`** (gitignored) and/or environment variables. See **`docs/assistant-design.md`** (§4.2 and “Getting back to development”).
   - Put the file in the **repo root** (recommended). Both the **assistant** and the **official CLI** resolve it even when Yarn runs a workspace script with **`cwd` under `packages/`** (assistant walks up parent directories; CLI uses cosmiconfig with **`stopDir`** toward your home directory).
   - You can keep **assistant-only** keys (e.g. **`categoryId`**, **`memoryLearn`**) in the same file as **`serverUrl` / `password` / `syncId`** — the CLI **ignores** keys it does not use.
   - Use **valid JSON** (no trailing commas); a broken file is skipped and you may see “Server URL is required”.
4. Commands:
   - **`yarn assistant:spike`** — one-shot: find an uncategorized transaction (or target one) and optionally **`updateTransaction`**. Use **`--dry-run`** to log without writes. For real writes you need a **category id** in config/env (or legacy fallback env) — see the design doc. With **`ACTUAL_ASSISTANT_MEMORY_LEARN=1`** (or **`memoryLearn`** in JSON), a successful write also appends to **`assistant-memory.json`** (payee → category).
   - **`yarn assistant:poll --once`** — one **poll** iteration: sync budget, scan uncategorized transactions in the default window, update local **`assistant-state.json`** (seen / prompted ids). Consults **memory**: logs a **suggested** category when the payee matches; by default it **does not** write categories. Set **`ACTUAL_ASSISTANT_AUTO_APPLY_MEMORY=1`** / **`autoApplyMemory`** to call **`updateTransaction`** when memory matches. Omit **`--once`** to run until you stop the process (interval from **`ACTUAL_ASSISTANT_POLL_INTERVAL_MS`** or **`pollIntervalMs`**, default 60s). First run with an empty state file can log many lines if you have lots of historical uncategorized rows; later runs are quiet unless something new appears.
   - **`yarn workspace @actual-app/cli exec actual categories list`** — list category ids (after **`yarn build:cli`**).

State file default path: **`{ACTUAL_DATA_DIR}/assistant-state.json`** (override with **`ACTUAL_ASSISTANT_STATE_PATH`**). Memory file default: **`{ACTUAL_DATA_DIR}/assistant-memory.json`** (override with **`ACTUAL_ASSISTANT_MEMORY_PATH`**). Default **`ACTUAL_DATA_DIR`** is **`~/.actual-assistant/data`** if unset.

The assistant spike **defaults** **`serverUrl`** to **`http://localhost:5006`** if unset; the **official CLI** does **not** — set **`serverUrl`** in **`actual.config.json`** or **`ACTUAL_SERVER_URL`** (discovery above applies once the file is valid).

---

## Quick reference

| Goal                                        | Command                 |
| ------------------------------------------- | ----------------------- |
| Browser + sync (most common for full stack) | `yarn start:server-dev` |
| Browser only                                | `yarn start`            |
| Sync server process only                    | `yarn start:server`     |
| Desktop Electron                            | `yarn start:desktop`    |
| Docs                                        | `yarn start:docs`       |
| Rebuild API for Node tools                  | `yarn build:api`        |
| Rebuild CLI                                 | `yarn build:cli`        |
| Assistant: one-shot categorize (spike)      | `yarn assistant:spike`  |
| Assistant: poll uncategorized + state file  | `yarn assistant:poll`   |

---

## See also

- **Assistant roadmap, config, and smoke tests:** [`docs/assistant-design.md`](./assistant-design.md)
- **Contributor-wide commands and architecture:** [`AGENTS.md`](../AGENTS.md) (repository root)
