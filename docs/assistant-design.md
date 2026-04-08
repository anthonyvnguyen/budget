# Actual Budget — Personal Finance Assistant (Sidecar)

> **Location:** `docs/assistant-design.md` — fork-specific design notes. (This is separate from the upstream documentation site under `packages/docs`.)

Design document for tracking development. **Actual** remains the source of truth; this project is an **automation + interaction layer** on top.

**How to use this doc:** Update **Progress** whenever you finish a task or change focus. Commit the file with your PRs so history stays in git.

---

## Progress

| Field | Value |
|-------|--------|
| **Last updated** | 2026-04-08 |
| **Current focus** | P1 — config module, dry-run, and safer categorization policy than the spike. |

### Phase checklist

Use `[x]` / `[ ]` in git as you complete work.

- [x] **P0** — Spike: `@actual-app/api` connect, find uncategorized transaction, `updateTransaction` (`yarn assistant:spike`, `packages/assistant/src/spike.ts`)
- [ ] **P1** — Config module; dry-run mode; no blind auto-category in “real” mode
- [ ] **P2** — Poll loop + persisted “seen” / “prompted” transaction ids
- [ ] **P3** — Memory store (payee → category) + suggest before asking
- [ ] **P4** — Messaging adapter (one channel) + confirm/correct loop
- [ ] **P5** — Optional: mirror rules to Actual; metrics / logging

### Log (newest first)

| Date | Entry |
|------|--------|
| 2026-04-08 | P0 complete: spike run against test server; transaction categorized via API; `yarn build:api` ordered after `loot-core` decl build. Design doc added. |

### Getting back to development after a reboot

Do this in order when you sit down cold:

1. **Open a terminal** and go to the repo: `cd` → your `Budget` (or clone) directory.
2. **Install deps** if the repo is new on this machine or `package.json` / `yarn.lock` changed: `yarn install` (from repo root).
3. **Start Actual** in dev (browser + sync server): `yarn start:server-dev` — leave this running.
4. **Build the API bundle** if needed (first time after clone, after `git clean`, or if `packages/api/dist/` is missing): `yarn build:api`.
5. **Point the spike at your server** — same as before, e.g. `export ACTUAL_PASSWORD='…'` and `export ACTUAL_SYNC_ID='…'` (or use a local `.actualrc` / `actual.config.json`; those patterns are gitignored).
6. **Smoke test:** `yarn assistant:spike` — should connect and exit cleanly (or categorize if you have uncategorized txns).
7. **Re-read** [Progress](#progress) and `docs/assistant-design.md` to remember what phase you were on.

Your budget data lives in Actual’s sync + local cache (`ACTUAL_DATA_DIR`, default under `~/.actual-assistant/data` for the spike); you do not lose it by rebooting if the server data directory and your account are unchanged.

---

## 1. Goals

| Goal | Description |
|------|-------------|
| **Low friction** | User spends normally (cards, Venmo, etc.); minimal manual work in Actual for categorization. |
| **Accurate budget** | Categories in Actual stay correct; assistant applies updates via the official API. |
| **Improves over time** | Rules + **merchant memory** + user corrections reduce prompts and mistakes. |
| **Conversational confirmation** | User confirms or corrects categories via **messaging** (e.g. Telegram/Slack), not only the desktop app. |
| **No LLM** | Categorization uses **existing categories** only: Actual rules, deterministic logic, and learned payee→category memory—not generative AI. |

---

## 2. Responsibility split

### Actual Budget (upstream product)

- Accounts, balances, transactions, imports, bank sync.
- Categories, envelope/tracking budgets, **static rules**, reports.
- Data storage and sync server.

### This assistant (this repo / `packages/assistant`)

| Responsibility | Notes |
|------------------|--------|
| Detect work items | New or uncategorized transactions (polling or post-sync). |
| Propose category | Order: Actual’s own rules (already applied on import) → **memory** (payee/merchant pattern) → **ask user**. |
| Notify user | Out-of-band messaging (channel TBD). |
| Apply decisions | `updateTransaction` (and related API calls) via `@actual-app/api`. |
| Learn | Store corrections; optional promotion to **Actual rules** for stable patterns. |
| Dedupe / state | Track “already prompted” transaction ids to avoid spam. |

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

Already used in the **spike** (`yarn assistant:spike`):

- `init` / `shutdown`
- `downloadBudget` (sync id + server auth)
- `getAccounts`, `getTransactions`, `getCategories`
- `updateTransaction` (e.g. set `category`)

**Build prerequisite (repo root):** `yarn build:api` (builds `loot-core` declarations, then the API package).

Future handlers may also use: `getRules`, `createRule`, `aqlQuery` / `q`, `sync`, etc.

### 4.2 Configuration & secrets

- Server URL, password or session token, sync id, optional E2E password — **environment variables** or ignored config files (see repo `.gitignore` for `.actualrc` patterns).
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
- **Not** implemented in the spike; spike only proves API write path.

### 4.6 Persistence for “memory”

- Start simple: **SQLite** or JSON file next to config, keyed by user + payee string.
- Optional later: mirror high-confidence rows into **Actual rules** via API so the main app matches the assistant without the bot.

---

## 5. Phased roadmap (detail)

Live status is in **[Progress](#progress)** above.

| Phase | Deliverable |
|-------|-------------|
| **P0** | Spike: connect, find uncategorized txn, `updateTransaction` (`packages/assistant/src/spike.ts`) |
| **P1** | Config module; dry-run mode; never assign category without explicit policy (remove “first non-income” blind default for production path) |
| **P2** | Poll loop + “seen” / “prompted” store |
| **P3** | Memory store + suggest from memory before asking |
| **P4** | Messaging adapter (one channel) + confirm/correct loop |
| **P5** | Optional: push stable memory to Actual rules; metrics/logging |

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
- Official CLI (same API): `packages/cli` — useful for manual testing (`accounts list`, `transactions list`, `transactions update`).

---

## 9. Document maintenance

- **Progress:** After meaningful work, bump **Last updated**, adjust **Current focus**, tick checkboxes, and add a row to **Log**.
- **Design:** Update when messaging channel is chosen, memory schema is fixed, new API surfaces are used, or phases change scope.
