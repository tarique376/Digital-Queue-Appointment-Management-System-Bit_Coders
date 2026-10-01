import { NextRequest } from "next/server";
import { requireUser, json, failure } from "@/lib/http";
import { getState } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    return json(
      await getState(
        await requireUser(),
        req.nextUrl.searchParams.get("day") ?? undefined,
      ),
    );
  } catch (e) {
    return failure(e);
  }
}
