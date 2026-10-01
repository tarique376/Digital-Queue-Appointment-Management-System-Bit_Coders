import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
  randomUUID,
} from "node:crypto";
import type { DB } from "./db";
import { database } from "./db";
import { ensure } from "./errors";
import type { User } from "./types";
export const SESSION_COOKIE = "queueflow_session";
export function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string) {
  const [salt, value] = hash.split(":");
  if (!salt || !value) return false;
  const expected = Buffer.from(value, "hex");
  const actual = scryptSync(password, salt, 64);
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export async function sessionUser(
  token: string | undefined,
  db: DB = database(),
): Promise<User | null> {
  if (!token) return null;
  const { rows } = await db.query<User>(
    `SELECT u.id,u.name,u.email,u.phone,u.role,u.department_id,u.active FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.id=$1 AND s.expires_at>now() AND u.active=true`,
    [digest(token)],
  );
  return rows[0] ?? null;
}
export async function createSession(db: DB, userId: string) {
  const token = randomBytes(32).toString("hex");
  await db.query(
    "INSERT INTO sessions(id,user_id,expires_at) VALUES($1,$2,now()+interval '7 days')",
    [digest(token), userId],
  );
  return token;
}
export async function rateLimit(key: string, limit = 15) {
  const result = await database().query<{ count: number }>(
    `INSERT INTO auth_attempts(key,count,resets_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN auth_attempts.resets_at<now() THEN 1 ELSE auth_attempts.count+1 END,resets_at=CASE WHEN auth_attempts.resets_at<now() THEN now()+interval '15 minutes' ELSE auth_attempts.resets_at END RETURNING count`,
    [digest(key)],
  );
  ensure(
    result.rows[0].count <= limit,
    "Too many attempts. Try again in 15 minutes.",
    429,
  );
}
export async function register(
  db: DB,
  name: string,
  email: string,
  password: string,
  phone = "",
) {
  const id = randomUUID();
  await db.query(
    "INSERT INTO users(id,name,email,password_hash,phone) VALUES($1,$2,$3,$4,$5)",
    [id, name, email.toLowerCase(), hashPassword(password), phone],
  );
  return id;
}
