/**
 * Periodic poll: load budget, list uncategorized transactions, persist seen/prompted ids
 * so each transaction is escalated at most once (until messaging in a later phase).
 * Payee → category memory is consulted first: logs a suggestion; optional auto-apply
 * (ACTUAL_ASSISTANT_AUTO_APPLY_MEMORY / autoApplyMemory in config).
 *
 *   yarn assistant:poll
 *   yarn assistant:poll --once   # single iteration then exit
 *
 * Env: ACTUAL_ASSISTANT_POLL_INTERVAL_MS, ACTUAL_ASSISTANT_STATE_PATH,
 * ACTUAL_ASSISTANT_MEMORY_PATH, ACTUAL_ASSISTANT_AUTO_APPLY_MEMORY (see config.ts)
 */

import { mkdirSync } from 'node:fs';

import * as api from '@actual-app/api';

import { loadAssistantConfig, requireConnectionFields } from './config.ts';
import type { AssistantConfig } from './config.ts';
import { loadPersistedMemory, lookupCategoryId } from './memory.ts';
import {
  defaultTransactionDateRange,
  listUncategorizedTransactions,
} from './scan.ts';
import {
  loadPersistedState,
  savePersistedState,
  TransactionIdState,
} from './state.ts';

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function formatAmount(amount: number | undefined): string {
  if (amount === undefined) {
    return '?';
  }
  return (amount / 100).toFixed(2);
}

function categoryDisplayName(
  categories: Awaited<ReturnType<typeof api.getCategories>>,
  categoryId: string,
): string {
  const c = categories.find(x => x.id === categoryId);
  return c?.name ?? categoryId;
}

async function runPollIteration(
  config: AssistantConfig,
  txState: TransactionIdState,
  dryRunAutoApplyLogged: Set<string>,
): Promise<void> {
  const accounts = await api.getAccounts();
  const categories = await api.getCategories();
  const memory = loadPersistedMemory(config.memoryPath);
  const { startStr, endStr } = defaultTransactionDateRange();
  const rows = await listUncategorizedTransactions(accounts, startStr, endStr);

  for (const row of rows) {
    const wasSeen = txState.seen.has(row.id);
    txState.markSeen(row.id);
    if (!wasSeen) {
      console.log(
        `[poll] First seen uncategorized ${row.id} (${row.accountName}) payee=${row.payee ?? '—'} amount=${formatAmount(row.amount)} date=${row.date ?? '—'}`,
      );
    }

    const memoryCategoryId = lookupCategoryId(memory, row.payee);
    const memoryValid =
      memoryCategoryId && categories.some(c => c.id === memoryCategoryId);

    if (memoryCategoryId && !memoryValid) {
      console.log(
        `[poll] Memory references missing category ${memoryCategoryId} for payee=${row.payee ?? '—'}; ignoring`,
      );
    }

    if (memoryValid && memoryCategoryId) {
      const label = categoryDisplayName(categories, memoryCategoryId);
      console.log(
        `[poll] Memory suggests category "${label}" (${memoryCategoryId}) for payee=${row.payee ?? '—'} tx=${row.id}`,
      );

      if (config.autoApplyMemory) {
        if (config.dryRun) {
          if (!dryRunAutoApplyLogged.has(row.id)) {
            console.log(
              `[poll] dry-run: would auto-apply memory → updateTransaction(${row.id}, { category: "${memoryCategoryId}" })`,
            );
            dryRunAutoApplyLogged.add(row.id);
          }
        } else {
          try {
            await api.updateTransaction(row.id, {
              category: memoryCategoryId,
            });
            console.log(
              `[poll] Auto-applied memory category "${label}" for ${row.id}`,
            );
          } catch (err) {
            console.error(
              `[poll] Auto-apply failed for ${row.id}:`,
              err instanceof Error ? err.message : err,
            );
          }
        }
        continue;
      }
    }

    if (!txState.prompted.has(row.id)) {
      console.log(
        `[poll] Escalate once (prompted set): ${row.id} — messaging not wired yet; marking prompted`,
      );
      txState.markPrompted(row.id);
    }
  }

  if (txState.isDirty()) {
    savePersistedState(config.statePath, txState.toPersisted());
    txState.markSaved();
  }
}

async function connectAndRun(
  config: AssistantConfig,
  txState: TransactionIdState,
  dryRunAutoApplyLogged: Set<string>,
  once: boolean,
): Promise<boolean> {
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
    await runPollIteration(config, txState, dryRunAutoApplyLogged);
  } finally {
    await api.shutdown();
  }

  if (once) {
    return false;
  }
  return true;
}

async function main() {
  const argv = process.argv;
  const once = argv.includes('--once');
  const config = loadAssistantConfig(argv);
  requireConnectionFields(config);

  const persisted = loadPersistedState(config.statePath);
  const txState = new TransactionIdState(persisted);

  console.log(
    `[poll] state=${config.statePath} memory=${config.memoryPath} interval=${config.pollIntervalMs}ms dryRun=${config.dryRun} autoApplyMemory=${config.autoApplyMemory}${once ? ' (single run)' : ''}`,
  );

  if (config.dryRun) {
    console.log('[poll] dry-run: no budget writes; local state still updates.');
  }

  const dryRunAutoApplyLogged = new Set<string>();
  let running = true;
  const stop = () => {
    running = false;
    console.log('[poll] Shutting down…');
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  do {
    try {
      const continueLoop = await connectAndRun(
        config,
        txState,
        dryRunAutoApplyLogged,
        once,
      );
      if (!continueLoop) {
        break;
      }
    } catch (err) {
      console.error(
        '[poll] Iteration failed:',
        err instanceof Error ? err.message : err,
      );
    }

    if (!running || once) {
      break;
    }

    let waited = 0;
    const chunk = 500;
    while (waited < config.pollIntervalMs && running) {
      const step = Math.min(chunk, config.pollIntervalMs - waited);
      await sleep(step);
      waited += step;
    }
  } while (running);

  console.log('[poll] Done.');
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
