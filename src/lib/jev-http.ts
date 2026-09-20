import { JEV_MODEL } from "./jev-contract";
import {
  JevError,
  JEV_INPUT_LIMIT,
  readBoundedJson,
  validateJevSource,
} from "./jev-core";
import {
  hasJevAccess,
  issueJevSession,
  jevConfigured,
  jevCookie,
  requireJevOrigin,
  tokenMatches,
  type JevConfig,
} from "./jev-access";
import { JevService } from "./jev-service";

export function createJevHandlers(
  getConfig: () => JevConfig,
  service = new JevService(),
  clock: () => number = Date.now,
) {
  let unlockAttempts: number[] = [];
  const json = (
    body: unknown,
    status = 200,
    headers: Record<string, string> = {},
  ) =>
    Response.json(body, {
      status,
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        ...headers,
      },
    });
  const fail = (error: unknown) =>
    error instanceof JevError
      ? json({ error: error.message, code: error.code }, error.status)
      : json(
          {
            error: "AI review is unavailable. The trading rules are unchanged.",
            code: "unavailable",
          },
          503,
        );
  const configOrFail = () => {
    const config = getConfig();
    if (!jevConfigured(config))
      throw new JevError(
        "not_configured",
        "Configure the server-only TypeSafe key and a separate desk access token first.",
        503,
      );
    return config;
  };
  const requireJson = (request: Request) => {
    if (
      request.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/json"
    )
      throw new JevError(
        "invalid_content_type",
        "A JSON request is required.",
        415,
      );
  };
  return {
    status: async (request: Request) => {
      const config = getConfig();
      return json({
        configured: jevConfigured(config),
        unlocked: hasJevAccess(request, config, clock()),
        model: JEV_MODEL,
        mode: "shadow-context-only",
      });
    },
    unlock: async (request: Request) => {
      try {
        requireJevOrigin(request);
        const config = configOrFail();
        requireJson(request);
        const now = clock();
        unlockAttempts = unlockAttempts.filter((t) => now - t < 60_000);
        if (unlockAttempts.length >= 10)
          throw new JevError(
            "unlock_limit",
            "Too many unlock attempts. Wait one minute.",
            429,
          );
        unlockAttempts.push(now);
        const body = (await readBoundedJson(request, 512)) as {
          token?: unknown;
        } | null;
        if (
          !body ||
          typeof body.token !== "string" ||
          !tokenMatches(body.token, config.deskToken)
        )
          throw new JevError(
            "unauthorized",
            "Desk access token was not accepted. Do not enter your provider API key here.",
            401,
          );
        return json({ unlocked: true }, 200, {
          "Set-Cookie": jevCookie(
            request,
            issueJevSession(config.deskToken, now),
          ),
        });
      } catch (error) {
        return fail(error);
      }
    },
    lock: async (request: Request) => {
      try {
        requireJevOrigin(request);
        return json({ unlocked: false }, 200, {
          "Set-Cookie": jevCookie(request, "", 0),
        });
      } catch (error) {
        return fail(error);
      }
    },
    review: async (request: Request) => {
      try {
        requireJevOrigin(request);
        const config = configOrFail();
        if (!hasJevAccess(request, config, clock()))
          throw new JevError(
            "unauthorized",
            "Unlock the AI panel before requesting a paid review.",
            401,
          );
        requireJson(request);
        const source = validateJevSource(
          await readBoundedJson(request, JEV_INPUT_LIMIT),
          clock(),
        );
        if (JSON.stringify(source).includes(config.deskToken))
          throw new JevError(
            "sensitive_input",
            "Remove credentials from the source before reviewing it.",
          );
        return json(await service.review(source, config.apiKey));
      } catch (error) {
        return fail(error);
      }
    },
  };
}
