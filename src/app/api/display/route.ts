import { json, failure } from "@/lib/http";
import { publicDisplay } from "@/lib/domain";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return json(await publicDisplay());
  } catch (e) {
    return failure(e);
  }
}
