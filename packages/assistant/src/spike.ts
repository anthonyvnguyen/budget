/**
 * Minimal proof-of-life: connect to Actual, load your budget, set a category on one transaction.
 *
 * Prerequisite (once, or after a clean): `yarn build:api` from the repo root so `@actual-app/api` has `dist/`.
 *
 * Required env:
 *   ACTUAL_PASSWORD       — server login password
 *   ACTUAL_SYNC_ID        — Settings → Advanced → Sync ID
 *
 * Optional env:
 *   ACTUAL_SERVER_URL     — default http://localhost:5006
 *   ACTUAL_DATA_DIR       — local cache (default ~/.actual-assistant/data)
 *   ACTUAL_ENCRYPTION_PASSWORD — if the budget uses E2E encryption
 *   ACTUAL_SPIKE_TRANSACTION_ID — update this transaction only
 *   ACTUAL_SPIKE_CATEGORY_ID    — use this category id; else first visible non-income category
 */

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import * as api from '@actual-app/api';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v.trim();
}

function dateISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function main() {
  const serverURL =
    process.env.ACTUAL_SERVER_URL?.trim() || 'http://localhost:5006';
  const password = requireEnv('ACTUAL_PASSWORD');
  const syncId = requireEnv('ACTUAL_SYNC_ID');
  const dataDir =
    process.env.ACTUAL_DATA_DIR?.trim() ||
    join(homedir(), '.actual-assistant', 'data');
  const encryptionPassword = process.env.ACTUAL_ENCRYPTION_PASSWORD?.trim();

  mkdirSync(dataDir, { recursive: true });

  await api.init({
    dataDir,
    serverURL,
    password,
  });

  try {
    await api.downloadBudget(syncId, {
      password: encryptionPassword || undefined,
    });

    const accounts = await api.getAccounts();
    const openAccounts = accounts.filter(a => !a.closed);
    if (openAccounts.length === 0) {
      throw new Error('No open accounts found. Add an account in Actual first.');
    }

    const categories = await api.getCategories();
    const categoryId = resolveCategoryId(categories);

    const end = new Date();
    const start = new Date();
    start.setFullYear(start.getFullYear() - 2);
    const startStr = dateISO(start);
    const endStr = dateISO(end);

    const explicitTx = process.env.ACTUAL_SPIKE_TRANSACTION_ID?.trim();
    if (explicitTx) {
      await api.updateTransaction(explicitTx, { category: categoryId });
      console.log(
        `Updated transaction ${explicitTx} → category ${categoryId}`,
      );
      return;
    }

    for (const account of openAccounts) {
      const rows = await api.getTransactions(account.id, startStr, endStr);
      const tx = rows.find(
        r =>
          !r.tombstone &&
          !r.is_child &&
          (r.category == null || r.category === ''),
      );
      if (tx) {
        await api.updateTransaction(tx.id, { category: categoryId });
        console.log(
          `Categorized uncategorized transaction "${tx.id}" (${account.name}) → ${categoryId}`,
        );
        return;
      }
    }

    const first = await findFirstTransaction(openAccounts, startStr, endStr);
    if (!first) {
      console.log(
        'No transactions in the last 2 years. Add a transaction in Actual, then run again.',
      );
      return;
    }

    await api.updateTransaction(first.tx.id, { category: categoryId });
    console.log(
      `No uncategorized transactions. Reassigned "${first.tx.id}" (${first.account.name}) → ${categoryId}`,
    );
  } finally {
    await api.shutdown();
  }
}

function resolveCategoryId(
  categories: Awaited<ReturnType<typeof api.getCategories>>,
): string {
  const wanted = process.env.ACTUAL_SPIKE_CATEGORY_ID?.trim();
  if (wanted) {
    const c = categories.find(x => x.id === wanted);
    if (!c) {
      throw new Error(
        `ACTUAL_SPIKE_CATEGORY_ID ${wanted} not found in this budget.`,
      );
    }
    return c.id;
  }
  const visible = categories
    .filter(c => !c.hidden && !c.is_income)
    .sort((a, b) => a.name.localeCompare(b.name));
  if (visible.length === 0) {
    throw new Error('No non-income categories available to assign.');
  }
  return visible[0].id;
}

async function findFirstTransaction(
  accounts: Awaited<ReturnType<typeof api.getAccounts>>,
  startStr: string,
  endStr: string,
): Promise<{ account: (typeof accounts)[0]; tx: { id: string } } | null> {
  for (const account of accounts) {
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
