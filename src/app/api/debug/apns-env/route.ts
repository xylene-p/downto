import { NextResponse } from "next/server";
export const runtime = "nodejs";
export async function GET() {
  const v = process.env.APNS_SANDBOX;
  return NextResponse.json({
    has: typeof v !== "undefined",
    raw_length: v?.length ?? null,
    bytes: v ? Array.from(v).map((c) => c.charCodeAt(0)) : null,
    eq_true: v === "true",
    trim_eq_true: v?.trim() === "true",
    vercel_env: process.env.VERCEL_ENV,
  });
}
