import { homedir } from 'os';
import { join } from 'path';

import { cosmiconfig } from 'cosmiconfig';

import { isRecord } from './utils';

export type CliConfig = {
  serverUrl: string;
  password?: string;
  sessionToken?: string;
  syncId?: string;
  dataDir: string;
  encryptionPassword?: string;
};

export type CliGlobalOpts = {
  serverUrl?: string;
  password?: string;
  sessionToken?: string;
  syncId?: string;
  dataDir?: string;
  encryptionPassword?: string;
  format?: 'json' | 'table' | 'csv';
  verbose?: boolean;
};

type ConfigFileContent = {
  serverUrl?: string;
  password?: string;
  sessionToken?: string;
  syncId?: string;
  dataDir?: string;
  encryptionPassword?: string;
};

const configFileKeys: readonly string[] = [
  'serverUrl',
  'password',
  'sessionToken',
  'syncId',
  'dataDir',
  'encryptionPassword',
];

/**
 * Reads only CLI-known string fields. Extra keys (e.g. assistant-only options in
 * the same `actual.config.json`) are ignored so one file can serve both tools.
 */
function pickCliConfigFields(value: unknown): ConfigFileContent {
  if (!isRecord(value)) {
    throw new Error('Invalid config file: expected an object');
  }
  const out: ConfigFileContent = {};
  for (const key of configFileKeys) {
    const v = value[key];
    if (v === undefined) {
      continue;
    }
    if (typeof v !== 'string') {
      throw new Error(
        `Invalid config file: key "${key}" must be a string, got ${typeof v}`,
      );
    }
    out[key as keyof ConfigFileContent] = v;
  }
  return out;
}

async function loadConfigFile(): Promise<ConfigFileContent> {
  const explorer = cosmiconfig('actual', {
    // cosmiconfig v9 defaults to searching only `process.cwd()` unless `stopDir` is set.
    // `yarn workspace … exec` often runs with cwd in `packages/<pkg>/`, so we walk up to the
    // user home (same as cosmiconfig’s global search) to find repo-root `actual.config.json`.
    stopDir: homedir(),
    searchPlaces: [
      'package.json',
      '.actualrc',
      '.actualrc.json',
      '.actualrc.yaml',
      '.actualrc.yml',
      'actual.config.json',
      'actual.config.yaml',
      'actual.config.yml',
    ],
  });
  const result = await explorer.search();
  if (result && !result.isEmpty) {
    return pickCliConfigFields(result.config);
  }
  return {};
}

export async function resolveConfig(
  cliOpts: CliGlobalOpts,
): Promise<CliConfig> {
  const fileConfig = await loadConfigFile();

  const serverUrl =
    cliOpts.serverUrl ??
    process.env.ACTUAL_SERVER_URL ??
    fileConfig.serverUrl ??
    '';

  const password =
    cliOpts.password ?? process.env.ACTUAL_PASSWORD ?? fileConfig.password;

  const sessionToken =
    cliOpts.sessionToken ??
    process.env.ACTUAL_SESSION_TOKEN ??
    fileConfig.sessionToken;

  const syncId =
    cliOpts.syncId ?? process.env.ACTUAL_SYNC_ID ?? fileConfig.syncId;

  const dataDir =
    cliOpts.dataDir ??
    process.env.ACTUAL_DATA_DIR ??
    fileConfig.dataDir ??
    join(homedir(), '.actual-cli', 'data');

  const encryptionPassword =
    cliOpts.encryptionPassword ??
    process.env.ACTUAL_ENCRYPTION_PASSWORD ??
    fileConfig.encryptionPassword;

  if (!serverUrl) {
    throw new Error(
      'Server URL is required. Set --server-url, ACTUAL_SERVER_URL env var, or serverUrl in config file.',
    );
  }

  if (!password && !sessionToken) {
    throw new Error(
      'Authentication required. Set --password/--session-token, ACTUAL_PASSWORD/ACTUAL_SESSION_TOKEN env var, or password/sessionToken in config file.',
    );
  }

  return {
    serverUrl,
    password,
    sessionToken,
    syncId,
    dataDir,
    encryptionPassword,
  };
}
