import { env } from 'cloudflare:workers';

type AiAction =
  | 'connection_status'
  | 'connection_catalog'
  | 'retrain'
  | 'diagnose'
  | 'apply_learning'
  | 'kai_train'
  | 'kai_promote'
  | 'kai_predict'
  | 'trade_start'
  | 'trade_stop'
  | 'trade_clear_kill'
  | 'trade_inspect'
  | 'trade_status'
  | 'ledger_recent'
  | 'external_feed'
  | 'external_catalog';

const ALLOWED_ACTIONS: readonly AiAction[] = [
  'connection_status',
  'connection_catalog',
  'retrain',
  'diagnose',
  'apply_learning',
  'kai_train',
  'kai_promote',
  'kai_predict',
  'trade_start',
  'trade_stop',
  'trade_clear_kill',
  'trade_inspect',
  'trade_status',
  'ledger_recent',
  'external_feed',
  'external_catalog',
] as const;
type CommandStatus = 'pending' | 'running' | 'completed' | 'error';

export type AiCommand = {
  id: string;
  action: AiAction;
  payload: Record<string, unknown>;
  status: CommandStatus;
  created_at: string;
  updated_at: string;
  result?: Record<string, unknown>;
  error?: string;
};

type SnapshotRecord = {
  snapshot: Record<string, unknown>;
  received_at: string;
};

const SNAPSHOT_KEY = 'ai:snapshot:v1';
const COMMAND_INDEX_KEY = 'ai:commands:index:v1';
const COMMAND_PREFIX = 'ai:command:v1:';
const MAX_COMMANDS = 20;
const STALE_SEC = 90;
const ALLOWED_TRADE_SYMBOLS = new Set([
  'BTCUSDm',
  'ETHUSDm',
  'EURUSDm',
  'USDJPYm',
  'GBPUSDm',
]);
const LIVE_CONFIRM = 'I_UNDERSTAND_LIVE_TRADING';

type AiEnv = {
  AI_STATE?: KVNamespace;
  AI_BRIDGE_TOKEN?: string;
};

function aiEnv(): AiEnv {
  return env as unknown as AiEnv;
}

export function json(
  payload: Record<string, unknown>,
  status = 200,
): Response {
  return Response.json(payload, {
    status,
    headers: {
      'Cache-Control': 'no-store, private',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function now(): string {
  return new Date().toISOString();
}

async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(left)),
    crypto.subtle.digest('SHA-256', encoder.encode(right)),
  ]);
  const aa = new Uint8Array(a);
  const bb = new Uint8Array(b);
  let diff = aa.length ^ bb.length;
  for (let index = 0; index < aa.length; index += 1) {
    diff |= aa[index] ^ bb[index];
  }
  return diff === 0;
}

function store(): KVNamespace {
  const binding = aiEnv().AI_STATE;
  if (!binding) throw new Error('AI_STATE binding is not configured');
  return binding;
}

export async function requireBridge(request: Request): Promise<Response | null> {
  const expected = aiEnv().AI_BRIDGE_TOKEN ?? '';
  const authorization = request.headers.get('authorization') ?? '';
  const provided = authorization.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length)
    : '';
  if (
    expected.length < 32
    || provided.length < 32
    || !(await constantTimeEqual(provided, expected))
  ) {
    return json({ error: 'unauthorized' }, 401);
  }
  return null;
}

function boundedInteger(
  payload: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = payload[key] ?? fallback;
  const value = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedNumber(
  payload: Record<string, unknown>,
  key: string,
  minimum: number,
  maximum: number,
): number {
  const value = Number(payload[key]);
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${key} must be a number between ${minimum} and ${maximum}`);
  }
  return value;
}

function boundedString(
  payload: Record<string, unknown>,
  key: string,
  maximum: number,
): string {
  const value = String(payload[key] ?? '').trim();
  if (!value || value.length > maximum) {
    throw new Error(`${key} must be 1 to ${maximum} characters`);
  }
  return value;
}

function normalizePayload(
  action: AiAction,
  value: unknown,
): Record<string, unknown> {
  const payload = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  if (action === 'retrain') {
    const source = String(payload.source ?? 'synthetic');
    if (source !== 'synthetic') throw new Error('source must be synthetic');
    return {
      source,
      n_bars: boundedInteger(payload, 'n_bars', 800, 300, 5000),
      seed: boundedInteger(payload, 'seed', 42, 0, 2_147_483_647),
      horizon: boundedInteger(payload, 'horizon', 1, 1, 24),
    };
  }
  if (action === 'diagnose') {
    return {
      n_bars: boundedInteger(payload, 'n_bars', 500, 240, 2000),
      seed: boundedInteger(payload, 'seed', 7, 0, 2_147_483_647),
    };
  }
  if (action === 'kai_train') return {};
  if (action === 'kai_promote') {
    const modelId = boundedString(payload, 'model_id', 80);
    if (!/^model_[0-9a-f-]{36}$/i.test(modelId)) {
      throw new Error('model_id has invalid format');
    }
    return {
      model_id: modelId,
      approved_by: boundedString(payload, 'approved_by', 120),
    };
  }
  if (action === 'kai_predict') {
    const precision = boundedString(payload, 'precision', 8).toLowerCase();
    if (!['fp32', 'fp16', 'bf16', 'int8', 'other'].includes(precision)) {
      throw new Error('precision is unsupported');
    }
    return {
      gpu_memory_mb: boundedNumber(payload, 'gpu_memory_mb', 1, 1_048_576),
      requested_memory_mb: boundedNumber(payload, 'requested_memory_mb', 0, 1_048_576),
      batch_size: boundedInteger(payload, 'batch_size', 1, 1, 10_000_000),
      sequence_length: boundedInteger(payload, 'sequence_length', 1, 1, 10_000_000),
      model_parameters_billion: boundedNumber(
        payload,
        'model_parameters_billion',
        0,
        1_000_000,
      ),
      gpu_count: boundedInteger(payload, 'gpu_count', 1, 1, 64),
      precision,
    };
  }
  if (action === 'trade_start') {
    const mode = String(payload.mode ?? 'dry_run').trim().toLowerCase();
    if (mode !== 'dry_run' && mode !== 'live' && mode !== 'shadow') {
      throw new Error('mode must be dry_run, live, or shadow');
    }
    if (mode === 'live') {
      const confirm = String(payload.confirm ?? '').trim();
      if (confirm !== LIVE_CONFIRM) {
        throw new Error(`live trading requires confirm=${LIVE_CONFIRM}`);
      }
    }
    const strategy = String(payload.strategy ?? 'medallion').trim();
    if (strategy !== 'medallion') throw new Error('strategy not allowed remotely');
    const timeframe = String(payload.timeframe ?? '15m').trim();
    if (timeframe !== '15m') throw new Error('timeframe not allowed remotely');
    let preset: string | undefined;
    if (payload.preset != null && String(payload.preset).trim()) {
      preset = String(payload.preset).trim();
      if (preset !== 'crypto' && preset !== 'fx') {
        throw new Error('preset not allowed remotely');
      }
    }
    let symbols: string[];
    if (payload.symbols == null) {
      symbols = [preset === 'fx' ? 'EURUSDm' : 'BTCUSDm'];
    } else if (typeof payload.symbols === 'string') {
      symbols = payload.symbols.split(',').map((part) => part.trim()).filter(Boolean);
    } else if (Array.isArray(payload.symbols)) {
      symbols = payload.symbols.map((part) => String(part).trim()).filter(Boolean);
    } else {
      throw new Error('symbols must be a string or list');
    }
    if (!symbols.length) throw new Error('symbols required');
    for (const symbol of symbols) {
      if (!ALLOWED_TRADE_SYMBOLS.has(symbol)) {
        throw new Error(`symbol not allowed remotely: ${symbol}`);
      }
    }
    const maxLotsRaw = payload.max_lots == null ? 0.01 : Number(payload.max_lots);
    if (!Number.isFinite(maxLotsRaw) || maxLotsRaw <= 0 || maxLotsRaw > 0.01) {
      throw new Error('max_lots must be a number between 0 and 0.01');
    }
    const warmup = boundedInteger(payload, 'warmup', 500, 50, 5000);
    const normalized: Record<string, unknown> = {
      mode,
      strategy,
      timeframe,
      symbols,
      max_lots: maxLotsRaw,
      warmup,
    };
    if (preset) normalized.preset = preset;
    if (mode === 'live') normalized.confirm = LIVE_CONFIRM;
    return normalized;
  }
  if (action === 'trade_stop') {
    const reason = String(payload.reason ?? 'remote_stop').trim() || 'remote_stop';
    if (reason.length > 120) throw new Error('reason must be 1 to 120 characters');
    return { reason };
  }
  if (action === 'trade_clear_kill') return {};
  if (action === 'trade_inspect') {
    const dryRun = payload.dry_run === false ? false : true;
    const out: Record<string, unknown> = { dry_run: dryRun };
    if (payload.symbols != null) {
      const start = normalizePayload('trade_start', {
        mode: 'dry_run',
        symbols: payload.symbols,
        max_lots: payload.max_lots ?? 0.01,
      });
      out.symbols = start.symbols;
      out.max_lots = start.max_lots;
    }
    return out;
  }
  if (action === 'trade_status') return {};
  if (action === 'connection_status') {
    return { probe: payload.probe === false ? false : true };
  }
  if (action === 'connection_catalog') return {};
  if (action === 'ledger_recent') {
    // リモートから任意DBパスは受けない（端末 LIVE_DB 固定）
    return {
      limit: boundedInteger(payload, 'limit', 50, 1, 200),
    };
  }
  if (action === 'apply_learning') return {};
  if (action === 'external_catalog') return {};
  if (action === 'external_feed') {
    return { force: payload.force === true };
  }
  return {};
}

function commandKey(id: string): string {
  return `${COMMAND_PREFIX}${id}`;
}

async function commandIndex(kv = store()): Promise<string[]> {
  const value = await kv.get(COMMAND_INDEX_KEY, 'json');
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string').slice(0, MAX_COMMANDS);
}

export async function queueCommand(
  actionValue: unknown,
  payloadValue: unknown,
): Promise<AiCommand> {
  const action = String(actionValue) as AiAction;
  if (!(ALLOWED_ACTIONS as readonly string[]).includes(action)) {
    throw new Error('unsupported action');
  }
  const timestamp = now();
  const command: AiCommand = {
    id: crypto.randomUUID(),
    action,
    payload: normalizePayload(action, payloadValue),
    status: 'pending',
    created_at: timestamp,
    updated_at: timestamp,
  };
  const kv = store();
  const index = await commandIndex(kv);
  const nextIndex = [command.id, ...index.filter((id) => id !== command.id)].slice(0, MAX_COMMANDS);
  await Promise.all([
    kv.put(commandKey(command.id), JSON.stringify(command), { expirationTtl: 604_800 }),
    kv.put(COMMAND_INDEX_KEY, JSON.stringify(nextIndex)),
  ]);
  return command;
}

export async function listCommands(
  statuses?: ReadonlySet<CommandStatus>,
): Promise<AiCommand[]> {
  const kv = store();
  const index = await commandIndex(kv);
  const rows = await Promise.all(
    index.map(async (id) => kv.get(commandKey(id), 'json') as Promise<AiCommand | null>),
  );
  return rows.filter((row): row is AiCommand => {
    if (!row || typeof row !== 'object') return false;
    return !statuses || statuses.has(row.status);
  });
}

export async function updateCommand(
  id: string,
  statusValue: unknown,
  resultValue: unknown,
  errorValue: unknown,
): Promise<AiCommand | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const status = String(statusValue) as CommandStatus;
  if (!(['running', 'completed', 'error'] as const).includes(status)) {
    throw new Error('invalid command status');
  }
  const kv = store();
  const command = await kv.get(commandKey(id), 'json') as AiCommand | null;
  if (!command) return null;

  command.status = status;
  command.updated_at = now();
  if (
    resultValue
    && typeof resultValue === 'object'
    && !Array.isArray(resultValue)
  ) {
    command.result = resultValue as Record<string, unknown>;
  }
  if (typeof errorValue === 'string') command.error = errorValue.slice(0, 2000);
  await kv.put(commandKey(id), JSON.stringify(command), { expirationTtl: 604_800 });
  return command;
}

export async function saveSnapshot(value: unknown): Promise<void> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('snapshot must be an object');
  }
  const snapshot = value as Record<string, unknown>;
  if (
    typeof snapshot.ts !== 'string'
    || !snapshot.system
    || !snapshot.models
  ) {
    throw new Error('invalid snapshot shape');
  }
  const record: SnapshotRecord = {
    snapshot,
    received_at: now(),
  };
  await store().put(SNAPSHOT_KEY, JSON.stringify(record), { expirationTtl: 86_400 });
}

export async function loadSnapshot(): Promise<SnapshotRecord | null> {
  return store().get(SNAPSHOT_KEY, 'json') as Promise<SnapshotRecord | null>;
}

export function publicCommand(command: AiCommand): Record<string, unknown> {
  return {
    id: command.id,
    action: command.action,
    status: command.status,
    created_at: command.created_at,
    updated_at: command.updated_at,
    error: command.error,
  };
}

export async function buildPublicStatus(): Promise<Record<string, unknown>> {
  const record = await loadSnapshot();
  const commands = await listCommands();
  const publicCommands = commands.slice(0, 8).map(publicCommand);

  if (!record) {
    return {
      ts: now(),
      ai_alive: false,
      learning_feedback_ready: false,
      runtime_learning_applied: false,
      models: { ready: false, models: [] },
      probe: { ok: false, skipped: true },
      last_retrain: null,
      retrain_history: [],
      last_diagnose: null,
      kai: {
        ok: false,
        mode: 'bridge_offline',
        counts: {},
        champion: null,
        latest_candidate: null,
        latest_prediction: null,
        message: 'kai[解] 端末bridgeが接続していません',
      },
      learning: {
        available: false,
        reason: 'bridge_offline',
        message: 'トレード端末のブリッジがまだ接続していません',
      },
      live: { ok: false, mode: 'standby', reason: 'bridge_offline', kill_switch: false, counts: {}, recent: {} },
      presets: [],
      system: {
        overall: 'standby',
        layers: [],
        source_of_truth: [],
        limits: [
          'https://11hotel.vip/ai は監視ビュー。モデル本体はトレード端末側',
          'run_admin_bridge.py が動いているときだけ最新状態が表示される',
        ],
      },
      remote: {
        bridge_online: false,
        age_sec: null,
        received_at: null,
        commands: publicCommands,
      },
    };
  }

  const ageSec = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(record.received_at)) / 1000),
  );
  const online = ageSec <= STALE_SEC;
  return {
    ...record.snapshot,
    remote: {
      bridge_online: online,
      age_sec: ageSec,
      received_at: record.received_at,
      commands: publicCommands,
    },
  };
}
