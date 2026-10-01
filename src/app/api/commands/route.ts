import { NextRequest } from "next/server";
import { body, requireUser, sameOrigin, json, failure } from "@/lib/http";
import { command } from "@/lib/domain";
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    const user = await requireUser();
    const p = await body(req);
    return json(await command(user, p.action, p.input, p.key));
  } catch (e) {
    return failure(e);
  }
}
