/**
 * Assistant configuration: optional JSON file + environment variables.
 * Env wins over file values (so secrets can stay in env).
 */

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { defaultStatePath } from './state.ts';

export type AssistantConfigFile = {
  serverUrl?: string;
  password?: string;
  syncId?: string;
  dataDir?: string;
  encryptionPassword?: string;
  /** Category uuid; required for writes unless allowSpikeFallback is true */
  categoryId?: string;
  transactionId?: string;
  dryRun?: boolean;
  /** Dev-only: allow first non-income category + legacy spike reassignment */
  allowSpikeFallback?: boolean;
  /** Poll loop interval in ms (default 60000); env: ACTUAL_ASSISTANT_POLL_INTERVAL_MS */
  pollIntervalMs?: number;
  /** Override path for assistant-state.json; env: ACTUAL_ASSISTANT_STATE_PATH */
  statePath?: string;
};

export type AssistantConfig = {
  serverURL: string;
  password: string;
  syncId: string;
  dataDir: string;
  encryptionPassword?: string;
  dryRun: boolean;
  categoryId?: string;
  transactionId?: string;
  allowSpikeFallback: boolean;
  /** Poll interval for `assistant:poll` (milliseconds) */
  pollIntervalMs: number;
  /** Resolved path to persisted seen/prompted transaction ids */
  statePath: string;
};

function trimEnv(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v || undefined;
}

function parsePositiveIntMs(
  name: string,
  raw: string | undefined,
): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) {
    throw new Error(
      `${name} must be a positive integer (milliseconds, e.g. 60000)`,
    );
  }
  return n;
}

function parseBoolEnv(name: string): boolean | undefined {
  const v = trimEnv(name);
  if (v === undefined) {
    return undefined;
  }
  if (/^(1|true|yes|on)$/i.test(v)) {
    return true;
  }
  if (/^(0|false|no|off)$/i.test(v)) {
    return false;
  }
  return undefined;
}

function readConfigFile(path: string): AssistantConfigFile {
  const raw = readFileSync(path, 'utf8');
  const parsed: unknown = JSON.parse(raw);
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Invalid config file (expected object): ${path}`);
  }
  return parsed as AssistantConfigFile;
}

function defaultConfigPath(): string {
  return join(process.cwd(), 'actual.config.json');
}

/**
 * Resolve optional JSON config path: explicit env, then ./actual.config.json if present.
 */
export function resolveConfigFilePath(): string | undefined {
  const fromEnv =
    trimEnv('ACTUAL_ASSISTANT_CONFIG') ?? trimEnv('ACTUAL_CONFIG_PATH');
  if (fromEnv) {
    return fromEnv;
  }
  const fallback = defaultConfigPath();
  if (existsSync(fallback)) {
    return fallback;
  }
  return undefined;
}

function loadFileLayer(): AssistantConfigFile {
  const path = resolveConfigFilePath();
  if (!path) {
    return {};
  }
  return readConfigFile(path);
}

function resolveDryRun(argv: string[], file: AssistantConfigFile): boolean {
  if (argv.includes('--dry-run')) {
    return true;
  }
  const fromEnv = parseBoolEnv('ACTUAL_DRY_RUN');
  if (fromEnv !== undefined) {
    return fromEnv;
  }
  return file.dryRun === true;
}

function mergeConfig(
  file: AssistantConfigFile,
  argv: string[],
): AssistantConfig {
  const dryRun = resolveDryRun(argv, file);

  const allowSpikeFallback =
    parseBoolEnv('ACTUAL_ASSISTANT_ALLOW_SPIKE_FALLBACK') === true ||
    file.allowSpikeFallback === true;

  const serverURL =
    trimEnv('ACTUAL_SERVER_URL') ?? file.serverUrl ?? 'http://localhost:5006';

  const password = trimEnv('ACTUAL_PASSWORD') ?? file.password;
  const syncId = trimEnv('ACTUAL_SYNC_ID') ?? file.syncId;

  const dataDir =
    trimEnv('ACTUAL_DATA_DIR') ??
    file.dataDir ??
    join(homedir(), '.actual-assistant', 'data');

  const encryptionPassword =
    trimEnv('ACTUAL_ENCRYPTION_PASSWORD') ?? file.encryptionPassword;

  const categoryId =
    trimEnv('ACTUAL_SPIKE_CATEGORY_ID') ??
    trimEnv('ACTUAL_ASSISTANT_CATEGORY_ID') ??
    file.categoryId;

  const transactionId =
    trimEnv('ACTUAL_SPIKE_TRANSACTION_ID') ??
    trimEnv('ACTUAL_ASSISTANT_TRANSACTION_ID') ??
    file.transactionId;

  const pollIntervalMs =
    parsePositiveIntMs(
      'ACTUAL_ASSISTANT_POLL_INTERVAL_MS',
      trimEnv('ACTUAL_ASSISTANT_POLL_INTERVAL_MS'),
    ) ??
    (typeof file.pollIntervalMs === 'number' &&
    Number.isFinite(file.pollIntervalMs) &&
    file.pollIntervalMs >= 1
      ? Math.floor(file.pollIntervalMs)
      : 60_000);

  const statePathOverride =
    trimEnv('ACTUAL_ASSISTANT_STATE_PATH') ?? file.statePath?.trim();
  const statePath = statePathOverride
    ? statePathOverride
    : defaultStatePath(dataDir);

  return {
    serverURL,
    password: password ?? '',
    syncId: syncId ?? '',
    dataDir,
    encryptionPassword,
    dryRun,
    categoryId,
    transactionId,
    allowSpikeFallback,
    pollIntervalMs,
    statePath,
  };
}

export function loadAssistantConfig(
  argv: string[] = process.argv,
): AssistantConfig {
  const file = loadFileLayer();
  return mergeConfig(file, argv);
}

export function requireConnectionFields(config: AssistantConfig): void {
  if (!config.password) {
    throw new Error(
      'Missing password: set ACTUAL_PASSWORD or password in actual.config.json',
    );
  }
  if (!config.syncId) {
    throw new Error(
      'Missing sync id: set ACTUAL_SYNC_ID or syncId in actual.config.json',
    );
  }
}
