import { neon } from "@neondatabase/serverless";
import { randomUUID } from "node:crypto";
import { ForwardSignal } from "./forward-journal";
import { ADAPTIVE_VERSION } from "./adaptive-strategy";
import { ResearchModel } from "./types";

export const recorderConfigured = () =>
  !!process.env.DATABASE_URL && !!process.env.CRON_SECRET;
function database() {
  if (!process.env.DATABASE_URL)
    throw new Error("Recorder storage is not configured.");
  return neon(process.env.DATABASE_URL);
}
export async function acquireRecorderLease() {
  const sql = database(),
    owner = randomUUID();
  const rows =
    await sql`UPDATE desk_recorder SET lease_owner=${owner}, lease_until=now() + interval '90 seconds' WHERE id=1 AND (lease_until IS NULL OR lease_until < now()) RETURNING id`;
  return rows.length ? owner : null;
}
export async function releaseRecorderLease(
  owner: string,
  success: boolean,
  errors: string[],
) {
  const sql = database();
  await sql`UPDATE desk_recorder SET lease_until=NULL, lease_owner=NULL,
    last_attempt=now(), last_success=CASE WHEN ${success} THEN now() ELSE last_success END,
    errors=${JSON.stringify(errors)}::jsonb WHERE id=1 AND lease_owner=${owner}`;
}
export async function saveForwardSignal(signal: ForwardSignal) {
  const sql = database();
  await sql`INSERT INTO desk_forward_signals (id, version, coin, observed_at, status, payload)
    VALUES (${signal.id}, ${signal.version}, ${signal.coin}, ${signal.observedAt}, ${signal.status}, ${JSON.stringify(signal)}::jsonb)
    ON CONFLICT (id) DO NOTHING`;
}
export async function openForwardSignals(): Promise<ForwardSignal[]> {
  const rows =
    await database()`SELECT payload FROM desk_forward_signals WHERE version=${ADAPTIVE_VERSION} AND status IN ('pending','open') ORDER BY observed_at LIMIT 200`;
  return rows.map((r) => r.payload as ForwardSignal);
}
export async function updateForwardSignal(
  before: ForwardSignal,
  after: ForwardSignal,
) {
  const sql = database();
  await sql`UPDATE desk_forward_signals SET status=${after.status}, payload=${JSON.stringify(after)}::jsonb
    WHERE id=${before.id} AND status=${before.status} AND (payload->>'processedThrough')::bigint=${before.processedThrough}`;
}
export async function saveModelState(
  coin: string,
  model: ResearchModel,
  observedAt: number,
) {
  const sql = database();
  const key = `${ADAPTIVE_VERSION}:${coin}:${model.id}`;
  const fingerprint = JSON.stringify([
    model.status,
    model.plan?.id ?? null,
    model.watchLevel ?? null,
  ]);
  const payload = JSON.stringify({
    coin,
    model: model.label,
    status: model.status,
    summary: model.summary,
    watchLevel: model.watchLevel,
    planId: model.plan?.id ?? null,
    observedAt,
  });
  // Atomic state transition: retries and overlapping scans cannot duplicate it.
  await sql`WITH prior AS (
    SELECT fingerprint FROM desk_model_states WHERE id=${key}
  ), changed AS (
    INSERT INTO desk_model_states (id, fingerprint, observed_at) VALUES (${key}, ${fingerprint}, ${observedAt})
    ON CONFLICT (id) DO UPDATE SET fingerprint=EXCLUDED.fingerprint, observed_at=EXCLUDED.observed_at
    WHERE desk_model_states.observed_at < EXCLUDED.observed_at RETURNING id
  ) INSERT INTO desk_model_events (version, observed_at, payload) SELECT ${ADAPTIVE_VERSION}, ${observedAt}, ${payload}::jsonb FROM changed
    WHERE NOT EXISTS (SELECT 1 FROM prior WHERE fingerprint=${fingerprint})`;
}
export async function readForwardJournal() {
  if (!recorderConfigured())
    return {
      configured: false,
      lastSuccess: null,
      lastAttempt: null,
      errors: [],
      signals: [],
      transitions: [],
    };
  const sql = database();
  const [signals, transitions, heartbeat] = await Promise.all([
    sql`SELECT payload FROM desk_forward_signals WHERE version=${ADAPTIVE_VERSION} ORDER BY observed_at DESC LIMIT 1000`,
    sql`SELECT payload FROM desk_model_events WHERE version=${ADAPTIVE_VERSION} ORDER BY observed_at DESC, id DESC LIMIT 100`,
    sql`SELECT last_success, last_attempt, errors FROM desk_recorder WHERE id=1`,
  ]);
  return {
    configured: true,
    lastSuccess: heartbeat[0]?.last_success ?? null,
    lastAttempt: heartbeat[0]?.last_attempt ?? null,
    errors: heartbeat[0]?.errors ?? [],
    signals: signals.map((r) => r.payload as ForwardSignal),
    transitions: transitions.map((r) => r.payload),
  };
}
