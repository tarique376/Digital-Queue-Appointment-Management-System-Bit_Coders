import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { database, transaction, configured } from "@/lib/db";
import {
  createSession,
  digest,
  hashPassword,
  rateLimit,
  register,
  SESSION_COOKIE,
  verifyPassword,
} from "@/lib/auth";
import { body, failure, json, sameOrigin } from "@/lib/http";
import { ensure } from "@/lib/errors";
import { notify } from "@/lib/domain";
const credentials = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((s) => s.toLowerCase()),
  password: z.string().min(1).max(128),
});
export async function POST(req: NextRequest) {
  try {
    sameOrigin(req);
    ensure(
      configured(),
      "Add DATABASE_URL to .env.local, then run db:migrate and db:seed.",
      503,
    );
    const raw = await body(req);
    const action = z
      .enum(["login", "register", "logout", "forgot", "reset"])
      .parse(raw.action);
    const jar = await cookies();
    if (action === "logout") {
      const token = jar.get(SESSION_COOKIE)?.value;
      if (token)
        await database().query("DELETE FROM sessions WHERE id=$1", [
          digest(token),
        ]);
      jar.delete(SESSION_COOKIE);
      return json({ ok: true });
    }
    await rateLimit(
      `ip:${req.headers.get("x-forwarded-for")?.split(",")[0] ?? "local"}`,
      60,
    );
    if (action === "forgot") {
      const { email } = credentials.pick({ email: true }).parse(raw);
      await rateLimit(`reset:${email}`, 5);
      await transaction(async (db) => {
        const user = (
          await db.query<{ id: string }>(
            "SELECT id FROM users WHERE email=$1 AND active=true",
            [email],
          )
        ).rows[0];
        if (!user) return;
        const token = randomBytes(32).toString("hex");
        await db.query("DELETE FROM password_resets WHERE user_id=$1", [
          user.id,
        ]);
        await db.query(
          "INSERT INTO password_resets(id,user_id,expires_at) VALUES($1,$2,now()+interval '30 minutes')",
          [digest(token), user.id],
        );
        await notify(
          db,
          user.id,
          "Password reset",
          `Reset your password within 30 minutes: ${process.env.APP_URL ?? req.nextUrl.origin}/?reset=${token}`,
          `password-reset:${digest(token)}`,
        );
      });
      return json({
        message:
          "If this account exists, a reset link will be emailed when email delivery is configured.",
      });
    }
    if (action === "reset") {
      const p = z
        .object({
          token: z.string().regex(/^[a-f0-9]{64}$/),
          password: z.string().min(12).max(128),
        })
        .parse(raw);
      await transaction(async (db) => {
        const row = (
          await db.query<{ user_id: string }>(
            "SELECT user_id FROM password_resets WHERE id=$1 AND expires_at>now()",
            [digest(p.token)],
          )
        ).rows[0];
        ensure(row, "Reset link is invalid or expired.");
        await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          row.user_id,
          hashPassword(p.password),
        ]);
        await db.query("DELETE FROM sessions WHERE user_id=$1", [row.user_id]);
        await db.query("DELETE FROM password_resets WHERE user_id=$1", [
          row.user_id,
        ]);
      });
      return json({
        message: "Password updated. Sign in with your new password.",
      });
    }
    const p = credentials.parse(raw);
    await rateLimit(`account:${p.email}`, 15);
    let userId: string;
    if (action === "register") {
      const fields = z
        .object({
          name: z.string().trim().min(2).max(100),
          phone: z.string().max(30).default(""),
          password: z.string().min(12).max(128),
        })
        .parse(raw);
      userId = await transaction((db) =>
        register(db, fields.name, p.email, fields.password, fields.phone),
      );
    } else {
      const u = (
        await database().query<{
          id: string;
          password_hash: string;
          active: boolean;
        }>("SELECT id,password_hash,active FROM users WHERE email=$1", [
          p.email,
        ])
      ).rows[0];
      const valid = verifyPassword(
        p.password,
        u?.password_hash ??
          "00000000000000000000000000000000:00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
      );
      ensure(u?.active && valid, "Email or password is incorrect.", 401);
      userId = u.id;
    }
    const token = await createSession(database(), userId);
    jar.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 7 * 24 * 60 * 60,
    });
    return json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
