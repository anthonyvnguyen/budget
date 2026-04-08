# Actual Budget — Personal Finance Assistant (Sidecar)

> **Location:** `docs/assistant-design.md` — fork-specific design notes. (This is separate from the upstream documentation site under `packages/docs`.)

Design document for tracking development. **Actual** remains the source of truth; this project is an **automation + interaction layer** on top.

**How to use this doc:** Update **Progress** whenever you finish a task or change focus. Commit the file with your PRs so history stays in git.

---

## Progress

| Field             | Value                                                        |
| ----------------- | ------------------------------------------------------------ |
| **Last updated**  | 2026-04-08                                                   |
| **Current focus** | P4 — messaging adapter (one channel) + confirm/correct loop. |

### Phase checklist

Use `[x]` / `[ ]` in git as you complete work.

- [x] **P0** — Spike: `@actual-app/api` connect, find uncategorized transaction, `updateTransaction` (`yarn assistant:spike`, `packages/assistant/src/spike.ts`)
- [x] **P1** — Config module; dry-run mode; no blind auto-category in “real” mode
- [x] **P2** — Poll loop + persisted “seen” / “prompted” transaction ids (`yarn assistant:poll`, `packages/assistant/src/poll.ts`, `state.ts`, `scan.ts`)
- [x] **P3** — Memory store (payee → category) + suggest before asking
- [ ] **P4** — Messaging adapter (one channel) + confirm/correct loop
- [ ] **P5** — Optional: mirror rules to Actual; metrics / logging

### Log (newest first)

| Date       | Entry                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-04-08 | **CLI + shared config:** `packages/cli` cosmiconfig uses `stopDir: homedir()` so `yarn workspace … exec actual …` finds repo-root `actual.config.json`; unknown keys are ignored so assistant-only fields (e.g. `categoryId`) can live in the same file. **Assistant:** `resolveConfigFilePath` walks up parent dirs for `actual.config.json` when cwd is under `packages/`.                                                                                                              |
| 2026-04-08 | **P3 complete:** `assistant-memory.json` (default `{dataDir}/assistant-memory.json`, override `ACTUAL_ASSISTANT_MEMORY_PATH` / `memoryPath`); normalized payee keys; poll logs memory suggestion before escalate; optional `ACTUAL_ASSISTANT_AUTO_APPLY_MEMORY` / `autoApplyMemory` for `updateTransaction`; spike optional learn `ACTUAL_ASSISTANT_MEMORY_LEARN` / `memoryLearn` after a successful write. Code: `packages/assistant/src/memory.ts`, `poll.ts`, `spike.ts`, `config.ts`. |
| 2026-04-08 | Docs: aligned [`docs/local-startup.md`](local-startup.md) scenario **F** (spike vs poll, state file path, first-run noise); §4.1 / §4.2 here (poll uses API reads only; poll env + file keys).                                                                                                                                                                                                                                                                                            |
| 2026-04-07 | **P2 complete:** `yarn assistant:poll` — interval from `ACTUAL_ASSISTANT_POLL_INTERVAL_MS` or `pollIntervalMs` (default 60s); state file `assistant-state.json` under `dataDir` or `ACTUAL_ASSISTANT_STATE_PATH`; tracks seen + prompted transaction ids; `--once` for a single iteration; SIGINT/SIGTERM stops the loop. Shared uncategorized scan in `scan.ts`.                                                                                                                         |
| 2026-04-07 | Docs: [`docs/local-startup.md`](local-startup.md) (scenario-based startup); expanded “Getting back to development”; §4.2 / §8; link from reboot section.                                                                                                                                                                                                                                                                                                                                  |
| 2026-04-07 | **P1 complete:** `packages/assistant/src/config.ts` loads optional `actual.config.json` (or `ACTUAL_ASSISTANT_CONFIG` / `ACTUAL_CONFIG_PATH`) merged with env; `--dry-run` / `ACTUAL_DRY_RUN`; writes require explicit category (`ACTUAL_SPIKE_CATEGORY_ID`, `ACTUAL_ASSISTANT_CATEGORY_ID`, or `categoryId` in file) unless `ACTUAL_ASSISTANT_ALLOW_SPIKE_FALLBACK=1` (legacy spike: first non-income + optional reassignment when nothing uncategorized).                               |
| 2026-04-08 | P0 complete: spike run against test server; transaction categorized via API; `yarn build:api` ordered after `loot-core` decl build. Design doc added.                                                                                                                                                                                                                                                                                                                                     |

### Getting back to development after a reboot

For a **scenario-based** guide (web only vs web + sync vs desktop vs docs vs API tools), see **[`docs/local-startup.md`](local-startup.md)**.

Do this in order when you sit down cold (all **yarn** commands from the **repo root**):

1. **Terminal + repo:** `cd` to your `Budget` directory (or clone and `cd` into it).
2. **Install deps** if needed (new machine, or `package.json` / `yarn.lock` changed): `yarn install`.
3. **Run the Actual web app + sync server** — leave this terminal running:
   - `yarn start:server-dev`
   - Opens the **frontend** (typically **http://localhost:3001**) and runs the **sync server** (typically **http://localhost:5006**). Use the URL your terminal prints if it differs.
   - **Web UI only** (no sync server): `yarn start`.
4. **Build the API** when the assistant or CLI needs it (first time after clone, after `git clean`, or if `packages/api/dist/` is missing): `yarn build:api`. If `yarn assistant:spike` errors on missing modules under `packages/api/dist/`, run this again.
5. **Connection settings (password, sync id, server URL)** — pick one or combine (env **overrides** file):
   - **Recommended:** `actual.config.json` in the **repo root** (same folder you run yarn from). It is **gitignored** so secrets stay local. Minimal shape: `serverUrl`, `password`, `syncId`. Copy optional fields from `packages/assistant/actual.config.example.json` if you need `dataDir`, `encryptionPassword`, `categoryId`, etc.
   - **Or** export `ACTUAL_SERVER_URL`, `ACTUAL_PASSWORD`, `ACTUAL_SYNC_ID` (and `ACTUAL_ENCRYPTION_PASSWORD` if the budget uses E2E encryption).
   - The **spike** defaults `serverUrl` to `http://localhost:5006` if unset; the **official CLI** does **not** — set `serverUrl` in `actual.config.json` or `ACTUAL_SERVER_URL` for CLI commands.
6. **Optional — list category ids (CLI):** after `yarn build:cli`, from repo root:
   - `yarn workspace @actual-app/cli exec actual categories list`
   - There is no global `actual` on `PATH` unless you install it yourself; use `yarn workspace … exec` as above. Default output is JSON with an `id` per category.
7. **Smoke test the assistant:** from repo root, with `password` / `syncId` set (file or env):
   - **`yarn assistant:poll --once`** — no category required; scans uncategorized transactions and updates **`assistant-state.json`** (seen / prompted ids). Does not call `updateTransaction`. Good check that sync and detection work; a **first** run with an empty state file may log one line per uncategorized transaction in the scan window.
   - **`yarn assistant:spike --dry-run`** — no writes to Actual; needs a category id (`ACTUAL_SPIKE_CATEGORY_ID` or `categoryId` in config) **or** `ACTUAL_ASSISTANT_ALLOW_SPIKE_FALLBACK=1` for legacy behavior.
   - Real write: **`yarn assistant:spike`** (same flags/env as above, without `--dry-run`).
8. **Re-read** [Progress](#progress) and this file to see which phase you were on.

**Data:** Your budget lives in Actual’s sync + local API cache (`ACTUAL_DATA_DIR`, default `~/.actual-assistant/data` for the assistant). The poll stores **`assistant-state.json`** under that directory unless **`ACTUAL_ASSISTANT_STATE_PATH`** overrides it. Rebooting does not wipe cache or state if paths and account are unchanged.

---

## 1. Goals

| Goal                            | Description                                                                                                                               |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Low friction**                | User spends normally (cards, Venmo, etc.); minimal manual work in Actual for categorization.                                              |
| **Accurate budget**             | Categories in Actual stay correct; assistant applies updates via the official API.                                                        |
| **Improves over time**          | Rules + **merchant memory** + user corrections reduce prompts and mistakes.                                                               |
| **Conversational confirmation** | User confirms or corrects categories via **messaging** (e.g. Telegram/Slack), not only the desktop app.                                   |
| **No LLM**                      | Categorization uses **existing categories** only: Actual rules, deterministic logic, and learned payee→category memory—not generative AI. |

---

## 2. Responsibility split

### Actual Budget (upstream product)

- Accounts, balances, transactions, imports, bank sync.
- Categories, envelope/tracking budgets, **static rules**, reports.
- Data storage and sync server.

### This assistant (this repo / `packages/assistant`)

| Responsibility    | Notes                                                                                                       |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Detect work items | New or uncategorized transactions (polling or post-sync).                                                   |
| Propose category  | Order: Actual’s own rules (already applied on import) → **memory** (payee/merchant pattern) → **ask user**. |
| Notify user       | Out-of-band messaging (channel TBD).                                                                        |
| Apply decisions   | `updateTransaction` (and related API calls) via `@actual-app/api`.                                          |
| Learn             | Store corrections; optional promotion to **Actual rules** for stable patterns.                              |
| Dedupe / state    | Track “already prompted” transaction ids to avoid spam.                                                     |

---

## 3. High-level architecture

```text
[ Banks / imports / manual entry ]
              │
              ▼
      [ Actual Budget + sync server ]
              │
              │  @actual-app/api (Node)
              ▼
      ┌───────────────────────┐
      │  Assistant process    │
      │  · poll / trigger     │
      │  · rules + memory DB  │
      │  · notifier           │
      │  · apply + learn      │
      └───────────────────────┘
              │
              ▼
      [ Messaging: Telegram / Slack / … ]
```

- **Not** replacing Actual’s UI for budgeting math; **augmenting** categorization workflow and reminders.

---

## 4. Integrations & components

### 4.1 Actual programmatic API (`@actual-app/api`)

Used in the **spike** (`yarn assistant:spike`) and **poll** (`yarn assistant:poll`):

- `init` / `shutdown`
- `downloadBudget` (sync id + server auth)
- `getAccounts`, `getTransactions` — spike and poll (poll lists all uncategorized in range via `packages/assistant/src/scan.ts`)
- `getCategories` — spike and poll (poll resolves category names for memory suggestions)
- `updateTransaction` — spike when not dry-run; **poll** when **`autoApplyMemory`** is on and not dry-run (applies memory-suggested category)

**Build prerequisite (repo root):** `yarn build:api` (builds `loot-core` declarations, then the API package).

Future handlers may also use: `getRules`, `createRule`, `aqlQuery` / `q`, `sync`, etc.

### 4.2 Configuration & secrets

- Server URL, password or session token, sync id, optional E2E password — **environment variables** or ignored config files (see repo `.gitignore` for `.actualrc` and **`actual.config.json`**).
- **`actual.config.json`** in the **working directory** or any **parent directory** (so it works when Yarn runs a workspace script with cwd under `packages/`), or a path via **`ACTUAL_ASSISTANT_CONFIG`** / **`ACTUAL_CONFIG_PATH`**: merged with env; **env wins** for overrides. Full example: `packages/assistant/actual.config.example.json`. The **official CLI** also discovers repo-root `actual.config.json` when you use `yarn workspace @actual-app/cli exec …` (cosmiconfig walks up with `stopDir`).
- **Dry-run:** `ACTUAL_DRY_RUN=1` or `--dry-run` on the spike — connects and logs intended `updateTransaction` calls without writing. The poll respects dry-run for **Actual** writes (including memory auto-apply); local **`assistant-state.json`** still updates so deduping behavior matches a real run.
- **Explicit category policy:** real **spike** writes need a category id (`ACTUAL_SPIKE_CATEGORY_ID`, `ACTUAL_ASSISTANT_CATEGORY_ID`, or `categoryId` in file) unless `ACTUAL_ASSISTANT_ALLOW_SPIKE_FALLBACK=1` (development / legacy spike behavior only). **Poll** does not assign categories.
- **Poll / state file:** `ACTUAL_ASSISTANT_POLL_INTERVAL_MS` or `pollIntervalMs` in JSON (default **60000** ms). **`ACTUAL_ASSISTANT_STATE_PATH`** or `statePath` in JSON — otherwise state is **`{dataDir}/assistant-state.json`** where `dataDir` comes from `ACTUAL_DATA_DIR` or the default under `~/.actual-assistant/data`.
- **Memory (P3):** payee → category JSON **`{dataDir}/assistant-memory.json`** unless **`ACTUAL_ASSISTANT_MEMORY_PATH`** or **`memoryPath`** is set. Poll logs a **suggestion** from memory before the one-time escalate line; **`ACTUAL_ASSISTANT_AUTO_APPLY_MEMORY`** / **`autoApplyMemory`** applies via `updateTransaction` when not dry-run. Spike can **learn** mappings after a successful write with **`ACTUAL_ASSISTANT_MEMORY_LEARN`** / **`memoryLearn`**.
- Local cache directory for API (`ACTUAL_DATA_DIR` or default under `~/.actual-assistant/data`).

### 4.3 Detection strategy

- **Primary:** Periodic poll (e.g. every N minutes) while a long-running process is up.
- **Scope:** Transactions missing category, or optionally “low confidence” once memory exists.
- **Deduping:** Persist last-seen transaction id or “prompted” set so each txn is only escalated once (unless user asks to re-review).

### 4.4 Categorization logic (no LLM)

1. **Respect Actual** — Imports/sync already run built-in rules; assistant reads resulting state.
2. **Memory layer** — Local store: normalized payee / merchant key → `category_id` (with optional frequency or recency).
3. **Auto-apply** — If memory (or a future explicit rule table) matches with sufficient confidence, set category without messaging.
4. **Human fallback** — Send message with amount, payee, date, **suggested** category from memory or first guess; user replies with confirm or category choice (map reply to category id from `getCategories()`).

### 4.5 Messaging integration (planned)

- **Single channel to start** (recommend picking one: Telegram bot, Slack app, Discord, etc.).
- Flow: outbound structured message + inbound parse (confirm / category alias / numeric index from a generated list).
- **Not** implemented yet; the spike proves the **`updateTransaction`** write path. The poll only records **seen** / **prompted** transaction ids locally until a channel exists.

### 4.6 Persistence for “memory”

- Start simple: **SQLite** or JSON file next to config, keyed by user + payee string.
- Optional later: mirror high-confidence rows into **Actual rules** via API so the main app matches the assistant without the bot.

---

## 5. Phased roadmap (detail)

Live status is in **[Progress](#progress)** above.

| Phase  | Deliverable                                                                                                                              |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| **P0** | Spike: connect, find uncategorized txn, `updateTransaction` (`packages/assistant/src/spike.ts`)                                          |
| **P1** | Config module; dry-run mode; never assign category without explicit policy (remove “first non-income” blind default for production path) |
| **P2** | Poll loop + “seen” / “prompted” store                                                                                                    |
| **P3** | Memory store + suggest from memory before asking                                                                                         |
| **P4** | Messaging adapter (one channel) + confirm/correct loop                                                                                   |
| **P5** | Optional: push stable memory to Actual rules; metrics/logging                                                                            |

Adjust phases as you learn (e.g. P3 before P4 if you want memory without chat first).

---

## 6. Non-goals (current)

- Replacing Actual’s web/desktop UI for budgeting.
- LLM-based categorization or new category names not present in Actual.
- Hosting a public HTTP API on top of Actual (Actual’s Node API is in-process, not REST).

---

## 7. Risks & constraints

- **Latency:** Detection is only as fresh as last sync/import; not true card-network real time.
- **Multi-device:** Edits in app vs assistant need clear rules (e.g. only prompt if still uncategorized).
- **Secrets:** Never commit passwords; rotate test credentials if shared.

---

## 8. References

- Upstream: [Actual Budget](https://github.com/actualbudget/actual), [API docs](https://actualbudget.org/docs/api/).
- Official CLI (same API): `packages/cli` — build with `yarn build:cli`, then e.g. `yarn workspace @actual-app/cli exec actual categories list` (set `serverUrl` or `ACTUAL_SERVER_URL`). See [Getting back to development](#getting-back-to-development-after-a-reboot).

---

## 9. Document maintenance

- **Progress:** After meaningful work, bump **Last updated**, adjust **Current focus**, tick checkboxes, and add a row to **Log**.
- **Design:** Update when messaging channel is chosen, memory schema is fixed, new API surfaces are used, or phases change scope.
