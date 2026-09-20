import { jevHandlers } from "@/lib/jev-server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const GET = jevHandlers.status;
export const POST = jevHandlers.unlock;
export const DELETE = jevHandlers.lock;
