import { NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { json, failure } from "@/lib/http";
import { ensure } from "@/lib/errors";
import { runJobs } from "@/lib/jobs";

function checkAuth(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  const actual = req.headers.get("authorization") ?? "";
  ensure(
    expected && expected.length >= 32,
    "Scheduled job access has not been configured.",
    503,
  );
  const left = Buffer.from(actual),
    right = Buffer.from(`Bearer ${expected}`);
  ensure(
    left.length === right.length && timingSafeEqual(left, right),
    "Unauthorized.",
    401,
  );
}

// POST: manual trigger (curl / scripts)
export async function POST(req: NextRequest) {
  try {
    checkAuth(req);
    return json(await runJobs());
  } catch (e) {
    return failure(e);
  }
}

// GET: Vercel Cron calls GET /api/jobs with Authorization: Bearer <CRON_SECRET>
export async function GET(req: NextRequest) {
  try {
    checkAuth(req);
    return json(await runJobs());
  } catch (e) {
    return failure(e);
  }
}
