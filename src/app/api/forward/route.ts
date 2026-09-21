import { readForwardJournal } from "@/lib/forward-store";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(await readForwardJournal(), {
      headers: { "Cache-Control": "public, s-maxage=30" },
    });
  } catch {
    return Response.json(
      {
        error:
          "Forward journal unavailable. Recorded outcomes have not been replaced with empty results.",
      },
      { status: 503 },
    );
  }
}
