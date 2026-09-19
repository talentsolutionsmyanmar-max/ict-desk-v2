import { getScan } from "@/lib/market-data";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET() {
  try {
    return Response.json(await getScan(), {
      headers: {
        "Cache-Control": "public, s-maxage=50, stale-while-revalidate=5",
      },
    });
  } catch {
    return Response.json(
      {
        error:
          "Strategy scan is unavailable. Candidate eligibility is blocked.",
      },
      { status: 503 },
    );
  }
}
