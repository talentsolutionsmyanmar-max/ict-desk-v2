import { STRATEGY_VERSION } from "@/lib/strategy";
import { ADAPTIVE_VERSION } from "@/lib/adaptive-strategy";
export async function GET() {
  return Response.json({
    status: "ok",
    application: "ICT Edge Desk",
    strategy: STRATEGY_VERSION,
    research: ADAPTIVE_VERSION,
    mode: "research-only",
    time: new Date().toISOString(),
  });
}
