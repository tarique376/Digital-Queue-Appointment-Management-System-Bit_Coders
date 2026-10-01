import { database, configured } from "@/lib/db";
import { json } from "@/lib/http";
export async function GET() {
  if (!configured()) return json({ status: "setup-required" }, 503);
  try {
    await database().query("SELECT id FROM settings WHERE id=1");
    return json({ status: "ok" });
  } catch {
    return json({ status: "database-unavailable" }, 503);
  }
}
