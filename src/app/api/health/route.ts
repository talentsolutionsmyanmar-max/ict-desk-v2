import { STRATEGY_VERSION } from "@/lib/strategy";
import { RESEARCH_VERSION } from "@/lib/research-strategy";
export async function GET() {
  return Response.json({
    status: "ok",
    application: "ICT Edge Desk",
    strategy: STRATEGY_VERSION,
    research: RESEARCH_VERSION,
    mode: "research-only",
    time: new Date().toISOString(),
  });
}
