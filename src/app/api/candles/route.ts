import { getCandles, getMarkets } from "@/lib/market-data";
import { INTERVAL_MS, Interval } from "@/lib/types";
export const runtime = "nodejs";
export const maxDuration = 30;
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const coin = params.get("coin") ?? "BTC";
  const interval = params.get("interval") ?? "15m";
  if (
    !/^[A-Za-z0-9._-]{1,24}$/.test(coin) ||
    !Object.hasOwn(INTERVAL_MS, interval)
  )
    return Response.json(
      { error: "Unsupported symbol or timeframe." },
      { status: 400 },
    );
  try {
    const { markets } = await getMarkets();
    if (!markets.some((m) => m.coin === coin))
      return Response.json(
        { error: "Symbol is not in the active venue universe." },
        { status: 404 },
      );
    return Response.json(
      {
        coin,
        interval,
        candles: await getCandles(coin, interval as Interval),
        receivedAt: Date.now(),
        venue: "Hyperliquid",
      },
      { headers: { "Cache-Control": "public, s-maxage=5" } },
    );
  } catch {
    return Response.json(
      { error: "Candle feed unavailable. Please retry." },
      { status: 503 },
    );
  }
}
