import { STRATEGY_VERSION } from "@/lib/strategy";
export async function GET() {
  return Response.json({
    status: "ok",
    application: "ICT Edge Desk",
    strategy: STRATEGY_VERSION,
    mode: "research-only",
    time: new Date().toISOString(),
  });
}
