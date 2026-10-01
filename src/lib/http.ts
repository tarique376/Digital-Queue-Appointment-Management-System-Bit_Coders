import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError } from "zod";
import { configured } from "./db";
import { AppError, ensure } from "./errors";
import { sessionUser, SESSION_COOKIE } from "./auth";
export async function body(req: NextRequest) {
  ensure(
    Number(req.headers.get("content-length") ?? 0) <= 16384,
    "Request is too large.",
    413,
  );
  const text = await req.text();
  ensure(Buffer.byteLength(text) <= 16384, "Request is too large.", 413);
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError(400, "Invalid JSON.");
  }
}
export function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  const expected = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : req.nextUrl.origin;
  ensure(origin === expected, "Request origin is not allowed.", 403);
}
export async function requireUser() {
  ensure(
    configured(),
    "Database not configured. Add DATABASE_URL and run the migrations.",
    503,
  );
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const user = await sessionUser(token);
  ensure(user, "Please sign in.", 401);
  return user;
}
export function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}
export function failure(error: unknown) {
  if (error instanceof AppError)
    return json({ error: error.message }, error.status);
  if (error instanceof ZodError)
    return json(
      {
        error: error.issues
          .map((i) => `${i.path.join(".") || "Input"}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "23505")
      return json(
        {
          error: "This record already exists or conflicts with an assignment.",
        },
        409,
      );
    if (error.code === "23503")
      return json({ error: "A referenced record does not exist." }, 400);
  }
  console.error(
    "Request failed",
    error instanceof Error ? error.name : "Unknown error",
  );
  return json(
    {
      error:
        "The operation could not be completed. Check database configuration and server logs.",
    },
    500,
  );
}
