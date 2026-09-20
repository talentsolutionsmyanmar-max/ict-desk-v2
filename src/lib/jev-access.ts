import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { JevError } from "./jev-core";

export const JEV_COOKIE = "ict_jev_session";
export const JEV_SESSION_MS = 60 * 60 * 1000;
export type JevConfig = { apiKey: string; deskToken: string };

export function jevConfigured(config: JevConfig): boolean {
  return (
    config.apiKey.length > 20 &&
    !/\s/.test(config.apiKey) &&
    /^[a-f0-9]{64}$/.test(config.deskToken) &&
    config.deskToken !== config.apiKey
  );
}
export function tokenMatches(actual: string, expected: string): boolean {
  if (!expected || actual.length > 256) return false;
  const hash = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(hash(actual), hash(expected));
}
function sign(value: string, token: string) {
  return createHmac("sha256", token)
    .update(`jev-session-v1:${value}`)
    .digest("hex");
}
export function issueJevSession(token: string, now: number) {
  const payload = `${now + JEV_SESSION_MS}.${randomBytes(16).toString("hex")}`;
  return `${payload}.${sign(payload, token)}`;
}
export function hasJevAccess(
  request: Request,
  config: JevConfig,
  now: number,
): boolean {
  if (!jevConfigured(config)) return false;
  const authorization = request.headers.get("authorization") ?? "";
  if (
    authorization.startsWith("Bearer ") &&
    tokenMatches(authorization.slice(7), config.deskToken)
  )
    return true;
  const cookies = request.headers.get("cookie") ?? "";
  const session = cookies
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${JEV_COOKIE}=`))
    ?.slice(JEV_COOKIE.length + 1);
  if (!session || !/^\d{13}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(session))
    return false;
  const [expires, nonce, signature] = session.split(".");
  const expiry = Number(expires);
  return (
    expiry > now &&
    expiry <= now + JEV_SESSION_MS &&
    tokenMatches(signature, sign(`${expires}.${nonce}`, config.deskToken))
  );
}
export function requireJevOrigin(request: Request) {
  const url = new URL(request.url);
  const local = ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
  const origin = request.headers.get("origin");
  let sameOrigin = origin === url.origin;
  // NextURL normalizes loopback addresses to localhost. Accept that rewrite
  // only when the browser's original Host exactly matches its Origin and port.
  if (!sameOrigin && local && origin) {
    try {
      const client = new URL(origin);
      sameOrigin =
        origin === client.origin &&
        ["127.0.0.1", "localhost", "[::1]"].includes(client.hostname) &&
        client.protocol === url.protocol &&
        client.port === url.port &&
        request.headers.get("host") === client.host;
    } catch {
      /* Invalid origins fail closed below. */
    }
  }
  if (
    (url.protocol !== "https:" && !local) ||
    !sameOrigin ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new JevError(
      "origin_denied",
      "AI reviews must originate from this desk over HTTPS (or local loopback).",
      403,
    );
}
export function jevCookie(request: Request, value: string, maxAge = 3600) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${JEV_COOKIE}=${value}; Path=/api/ai; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}
