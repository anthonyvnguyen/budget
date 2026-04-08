/**
 * Minimal proof-of-life: connect to Actual, load your budget, set a category on one transaction.
 *
 * Prerequisite (once, or after a clean): `yarn build:api` from the repo root so `@actual-app/api` has `dist/`.
 *
 * Required env (or set in actual.config.json — see actual.config.example.json):
 *   ACTUAL_PASSWORD       — server login password
 *   ACTUAL_SYNC_ID        — Settings → Advanced → Sync ID
 *
 * Common optional env:
 *   ACTUAL_SERVER_URL     — default http://localhost:5006
 *   ACTUAL_DATA_DIR       — local cache (default ~/.actual-assistant/data)
 *   ACTUAL_ENCRYPTION_PASSWORD — if the budget uses E2E encryption
 *   ACTUAL_DRY_RUN=1 or --dry-run — log actions only; no updateTransaction
 *
 * Targeting:
 *   ACTUAL_SPIKE_TRANSACTION_ID / ACTUAL_ASSISTANT_TRANSACTION_ID — update this transaction only
 *
 * Category (required for real writes unless legacy fallback is enabled):
 *   ACTUAL_SPIKE_CATEGORY_ID / ACTUAL_ASSISTANT_CATEGORY_ID — category uuid
 *   ACTUAL_ASSISTANT_ALLOW_SPIKE_FALLBACK=1 — dev-only: first visible non-income category; may reassign
 *     an arbitrary transaction if none are uncategorized (old spike behavior)
 */

import { mkdirSync } from 'node:fs';

import * as api from '@actual-app/api';

import { loadAssistantConfig, requireConnectionFields } from './config.ts';
import type { AssistantConfig } from './config.ts';
import {
  defaultTransactionDateRange,
  findFirstUncategorizedTransaction,
} from './scan.ts';

async function applyCategory(
  txId: string,
  categoryId: string,
  config: AssistantConfig,
  label: string,
) {
  if (config.dryRun) {
    console.log(
      `[dry-run] Would set ${label} transaction ${txId} → category ${categoryId}`,
    );
    return;
  }
  await api.updateTransaction(txId, { category: categoryId });
  console.log(`Updated ${label} transaction ${txId} → category ${categoryId}`);
}

async function main() {
  const config = loadAssistantConfig();
  requireConnectionFields(config);

  if (config.dryRun) {
    console.log('[dry-run] No writes will be performed.');
  }

  mkdirSync(config.dataDir, { recursive: true });

  await api.init({
    dataDir: config.dataDir,
    serverURL: config.serverURL,
    password: config.password,
  });

  try {
    await api.downloadBudget(config.syncId, {
      password: config.encryptionPassword || undefined,
    });

    const accounts = await api.getAccounts();
    const openAccounts = accounts.filter(a => !a.closed);
    if (openAccounts.length === 0) {
      throw new Error(
        'No open accounts found. Add an account in Actual first.',
      );
    }

    const categories = await api.getCategories();
    const categoryId = resolveCategoryId(categories, config);

    const { startStr, endStr } = defaultTransactionDateRange();

    const explicitTx = config.transactionId?.trim();
    if (explicitTx) {
      await applyCategory(explicitTx, categoryId, config, 'explicit');
      return;
    }

    const firstUncat = await findFirstUncategorizedTransaction(
      accounts,
      startStr,
      endStr,
    );
    if (firstUncat) {
      await applyCategory(
        firstUncat.id,
        categoryId,
        config,
        `uncategorized (${firstUncat.accountName})`,
      );
      return;
    }

    if (!config.allowSpikeFallback) {
      console.log(
        'No uncategorized transactions in the last 2 years. Nothing to do.',
      );
      return;
    }

    const first = await findFirstTransaction(accounts, startStr, endStr);
    if (!first) {
      console.log(
        'No transactions in the last 2 years. Add a transaction in Actual, then run again.',
      );
      return;
    }

    await applyCategory(
      first.tx.id,
      categoryId,
      config,
      `fallback (${first.account.name}, allowSpikeFallback)`,
    );
  } finally {
    await api.shutdown();
  }
}

function resolveCategoryId(
  categories: Awaited<ReturnType<typeof api.getCategories>>,
  config: AssistantConfig,
): string {
  const wanted = config.categoryId?.trim();
  if (wanted) {
    const c = categories.find(x => x.id === wanted);
    if (!c) {
      throw new Error(`Category id ${wanted} not found in this budget.`);
    }
    return c.id;
  }
  if (config.allowSpikeFallback) {
    const visible = categories
      .filter(c => !c.hidden && !c.is_income)
      .sort((a, b) => a.name.localeCompare(b.name));
    if (visible.length === 0) {
      throw new Error('No non-income categories available to assign.');
    }
    return visible[0].id;
  }
  throw new Error(
    'No category specified. Set ACTUAL_SPIKE_CATEGORY_ID or ACTUAL_ASSISTANT_CATEGORY_ID, or categoryId in actual.config.json. For legacy spike behavior (first non-income category), set ACTUAL_ASSISTANT_ALLOW_SPIKE_FALLBACK=1.',
  );
}

async function findFirstTransaction(
  accounts: Awaited<ReturnType<typeof api.getAccounts>>,
  startStr: string,
  endStr: string,
): Promise<{ account: (typeof accounts)[0]; tx: { id: string } } | null> {
  const openAccounts = accounts.filter(a => !a.closed);
  for (const account of openAccounts) {
    const rows = await api.getTransactions(account.id, startStr, endStr);
    const tx = rows.find(r => !r.tombstone && !r.is_child);
    if (tx) {
      return { account, tx };
    }
  }
  return null;
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
