/**
 * Shared helpers for listing uncategorized transactions (same rules as the spike).
 */

import * as api from '@actual-app/api';

export type UncategorizedRow = {
  id: string;
  accountId: string;
  accountName: string;
  payee?: string;
  amount?: number;
  date?: string;
};

function isUncategorized(r: {
  tombstone?: boolean;
  is_child?: boolean;
  category?: string | null;
}): boolean {
  return (
    !r.tombstone && !r.is_child && (r.category == null || r.category === '')
  );
}

export function defaultTransactionDateRange(): {
  startStr: string;
  endStr: string;
} {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 2);
  return {
    startStr: start.toISOString().slice(0, 10),
    endStr: end.toISOString().slice(0, 10),
  };
}

/**
 * First uncategorized transaction in the same account order as the legacy spike.
 */
export async function findFirstUncategorizedTransaction(
  accounts: Awaited<ReturnType<typeof api.getAccounts>>,
  startStr: string,
  endStr: string,
): Promise<UncategorizedRow | null> {
  const openAccounts = accounts.filter(a => !a.closed);
  for (const account of openAccounts) {
    const rows = await api.getTransactions(account.id, startStr, endStr);
    const tx = rows.find(r => isUncategorized(r));
    if (tx) {
      return {
        id: tx.id,
        accountId: account.id,
        accountName: account.name,
        payee: tx.payee ?? undefined,
        amount: tx.amount,
        date: tx.date,
      };
    }
  }
  return null;
}

/**
 * All uncategorized transactions in the date window (open accounts only).
 */
export async function listUncategorizedTransactions(
  accounts: Awaited<ReturnType<typeof api.getAccounts>>,
  startStr: string,
  endStr: string,
): Promise<UncategorizedRow[]> {
  const openAccounts = accounts.filter(a => !a.closed);
  const out: UncategorizedRow[] = [];
  for (const account of openAccounts) {
    const rows = await api.getTransactions(account.id, startStr, endStr);
    for (const r of rows) {
      if (!isUncategorized(r)) {
        continue;
      }
      out.push({
        id: r.id,
        accountId: account.id,
        accountName: account.name,
        payee: r.payee ?? undefined,
        amount: r.amount,
        date: r.date,
      });
    }
  }
  return out;
}
