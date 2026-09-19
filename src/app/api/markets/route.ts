import { getMarkets } from "@/lib/market-data";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET() {
  try {
    return Response.json(await getMarkets(), {
      headers: {
        "Cache-Control": "public, s-maxage=15, stale-while-revalidate=10",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Hyperliquid market feed is unavailable. No simulated prices are substituted.",
      },
      { status: 503 },
    );
  }
}
