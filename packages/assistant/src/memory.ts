/**
 * Local payee → category memory (JSON next to assistant state).
 * Keys are normalized payee strings; values track category id and usage counts.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';

export type AssistantMemoryEntry = {
  categoryId: string;
  /** Times this mapping was reinforced (learn or manual). */
  count: number;
  /** ISO timestamp of last update */
  updatedAt: string;
};

export type AssistantMemoryPersistedV1 = {
  version: 1;
  /** Normalized payee key → entry */
  entries: Record<string, AssistantMemoryEntry>;
};

export type AssistantMemoryPersisted = AssistantMemoryPersistedV1;

const EMPTY: AssistantMemoryPersistedV1 = {
  version: 1,
  entries: {},
};

export function defaultMemoryPath(dataDir: string): string {
  return join(dataDir, 'assistant-memory.json');
}

/**
 * Normalize payee for stable lookup: NFKC, lower case, strip punctuation to spaces, collapse spaces.
 */
export function normalizePayeeKey(payee: string | undefined): string {
  if (payee == null) {
    return '';
  }
  const s = payee.normalize('NFKC').trim().toLowerCase();
  if (!s) {
    return '';
  }
  const alnumSpaced = s.replace(/[^\p{L}\p{N}\s]+/gu, ' ');
  return alnumSpaced.replace(/\s+/g, ' ').trim();
}

function parseMemory(raw: string): AssistantMemoryPersisted {
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Invalid memory file (expected object)');
  }
  const o = parsed as Record<string, unknown>;
  if (o.version !== 1) {
    throw new Error(
      `Unsupported assistant memory version: ${String(o.version)}`,
    );
  }
  const entries = o.entries;
  if (
    entries === null ||
    typeof entries !== 'object' ||
    Array.isArray(entries)
  ) {
    throw new Error('Invalid memory file (expected entries object)');
  }
  const out: Record<string, AssistantMemoryEntry> = {};
  for (const [key, val] of Object.entries(entries)) {
    if (typeof val !== 'object' || val === null || Array.isArray(val)) {
      throw new Error(`Invalid memory entry for key ${JSON.stringify(key)}`);
    }
    const e = val as Record<string, unknown>;
    const categoryId = e.categoryId;
    const count = e.count;
    const updatedAt = e.updatedAt;
    if (typeof categoryId !== 'string' || !categoryId.trim()) {
      throw new Error(`Invalid categoryId for key ${JSON.stringify(key)}`);
    }
    if (typeof count !== 'number' || !Number.isFinite(count) || count < 1) {
      throw new Error(`Invalid count for key ${JSON.stringify(key)}`);
    }
    if (typeof updatedAt !== 'string' || !updatedAt.trim()) {
      throw new Error(`Invalid updatedAt for key ${JSON.stringify(key)}`);
    }
    out[key] = {
      categoryId: categoryId.trim(),
      count: Math.floor(count),
      updatedAt: updatedAt.trim(),
    };
  }
  return { version: 1, entries: out };
}

export function loadPersistedMemory(path: string): AssistantMemoryPersisted {
  if (!existsSync(path)) {
    return { ...EMPTY, entries: {} };
  }
  const raw = readFileSync(path, 'utf8');
  return parseMemory(raw);
}

export function savePersistedMemory(
  path: string,
  memory: AssistantMemoryPersisted,
): void {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true });
  const serialized = `${JSON.stringify(memory, null, 2)}\n`;
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, serialized, 'utf8');
  renameSync(tmp, path);
}

export function lookupCategoryId(
  memory: AssistantMemoryPersisted,
  payee: string | undefined,
): string | undefined {
  const key = normalizePayeeKey(payee);
  if (!key) {
    return undefined;
  }
  return memory.entries[key]?.categoryId;
}

/**
 * Record or reinforce payee → category. Persists via caller.
 */
export function recordPayeeCategory(
  memory: AssistantMemoryPersisted,
  payee: string | undefined,
  categoryId: string,
): void {
  const key = normalizePayeeKey(payee);
  if (!key) {
    return;
  }
  const now = new Date().toISOString();
  const existing = memory.entries[key];
  if (existing && existing.categoryId === categoryId) {
    memory.entries[key] = {
      categoryId,
      count: existing.count + 1,
      updatedAt: now,
    };
  } else {
    memory.entries[key] = {
      categoryId,
      count: 1,
      updatedAt: now,
    };
  }
}
