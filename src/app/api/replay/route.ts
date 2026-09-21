import { getMarkets, getReplay } from "@/lib/market-data";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(request: Request) {
  const coin = new URL(request.url).searchParams.get("coin") ?? "BTC";
  if (!/^[A-Za-z0-9._-]{1,24}$/.test(coin))
    return Response.json({ error: "Unsupported symbol." }, { status: 400 });
  try {
    const { markets } = await getMarkets();
    const market = markets.find((m) => m.coin === coin);
    if (!market)
      return Response.json(
        { error: "Unknown active symbol." },
        { status: 404 },
      );
    return Response.json(await getReplay(market), {
      headers: { "Cache-Control": "public, s-maxage=60" },
    });
  } catch {
    return Response.json(
      { error: "Historical review unavailable. Please retry." },
      { status: 503 },
    );
  }
}
