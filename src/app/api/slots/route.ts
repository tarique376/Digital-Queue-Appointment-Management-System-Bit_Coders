import { NextRequest } from "next/server";
import { requireUser, json, failure } from "@/lib/http";
import { slots } from "@/lib/domain";
import { z } from "zod";
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const service = z
      .string()
      .uuid()
      .parse(req.nextUrl.searchParams.get("service"));
    const day = z.string().parse(req.nextUrl.searchParams.get("day"));
    return json({ slots: await slots(service, day) });
  } catch (e) {
    return failure(e);
  }
}
