/**
 * Persisted sets of transaction ids: "seen" (observed in a scan) and
 * "prompted" (surfaced once so we do not escalate repeatedly).
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export type AssistantPersistedStateV1 = {
  version: 1;
  seenTransactionIds: string[];
  promptedTransactionIds: string[];
};

export type AssistantPersistedState = AssistantPersistedStateV1;

const EMPTY: AssistantPersistedStateV1 = {
  version: 1,
  seenTransactionIds: [],
  promptedTransactionIds: [],
};

export function defaultStatePath(dataDir: string): string {
  return join(dataDir, 'assistant-state.json');
}

function parseState(raw: string): AssistantPersistedState {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid state file (expected object)');
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error(
      `Unsupported assistant state version: ${String(o.version)}`,
    );
  }
  const seen = o.seenTransactionIds;
  const prompted = o.promptedTransactionIds;
  if (!Array.isArray(seen) || !Array.isArray(prompted)) {
    throw new Error('Invalid state file (expected string arrays for id sets)');
  }
  for (const id of seen) {
    if (typeof id !== 'string') {
      throw new Error(
        'Invalid state file (seenTransactionIds must be strings)',
      );
    }
  }
  for (const id of prompted) {
    if (typeof id !== 'string') {
      throw new Error(
        'Invalid state file (promptedTransactionIds must be strings)',
      );
    }
  }
  return {
    version: 1,
    seenTransactionIds: seen as string[],
    promptedTransactionIds: prompted as string[],
  };
}

export function loadPersistedState(path: string): AssistantPersistedState {
  if (!existsSync(path)) {
    return { ...EMPTY };
  }
  const raw = readFileSync(path, 'utf8');
  return parseState(raw);
}

export function savePersistedState(
  path: string,
  state: AssistantPersistedState,
): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const serialized = `${JSON.stringify(state, null, 2)}\n`;
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, serialized, 'utf8');
  renameSync(tmp, path);
}

export class TransactionIdState {
  readonly seen = new Set<string>();
  readonly prompted = new Set<string>();
  private dirty = false;

  constructor(file: AssistantPersistedState) {
    for (const id of file.seenTransactionIds) {
      this.seen.add(id);
    }
    for (const id of file.promptedTransactionIds) {
      this.prompted.add(id);
    }
  }

  markSeen(id: string): void {
    if (!this.seen.has(id)) {
      this.seen.add(id);
      this.dirty = true;
    }
  }

  markPrompted(id: string): void {
    if (!this.prompted.has(id)) {
      this.prompted.add(id);
      this.dirty = true;
    }
  }

  isDirty(): boolean {
    return this.dirty;
  }

  markSaved(): void {
    this.dirty = false;
  }

  toPersisted(): AssistantPersistedState {
    return {
      version: 1,
      seenTransactionIds: [...this.seen].sort(),
      promptedTransactionIds: [...this.prompted].sort(),
    };
  }
}
