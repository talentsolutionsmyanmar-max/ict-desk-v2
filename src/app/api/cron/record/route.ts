import { tokenMatches } from "@/lib/jev-access";
import { recorderConfigured } from "@/lib/forward-store";
import { runForwardRecorder } from "@/lib/forward-recorder";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (
    !secret ||
    !tokenMatches(
      request.headers.get("authorization") ?? "",
      `Bearer ${secret}`,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!recorderConfigured())
    return Response.json(
      { error: "Recorder storage is not configured." },
      { status: 503 },
    );
  try {
    return Response.json(await runForwardRecorder(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return Response.json(
      { error: "Recorder failed. No successful heartbeat recorded." },
      { status: 503 },
    );
  }
}
