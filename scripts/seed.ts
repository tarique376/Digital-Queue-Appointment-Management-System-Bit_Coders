import { config } from "dotenv";
config({ path: ".env.local" });
config();
import { randomUUID } from "node:crypto";
import { transaction, closeDatabase } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";
async function seed() {
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set SEED_PASSWORD to a unique password with at least 12 characters.",
    );
  await transaction(async (db) => {
    if ((await db.query("SELECT id FROM users LIMIT 1")).rows.length) {
      console.log("Seed skipped: accounts already exist.");
      return;
    }
    const department = randomUUID(),
      second = randomUUID();
    await db.query(
      "INSERT INTO departments(id,name,workdays) VALUES($1,'Student Affairs','{1,2,3,4,5,6,7}'),($2,'Examination Office','{1,2,3,4,5,6,7}')",
      [department, second],
    );
    const roles = [
      ["Alex Morgan", "admin@queueflow.local", "ADMIN", null],
      ["Sam Taylor", "manager@queueflow.local", "MANAGER", department],
      ["Riley Chen", "staff@queueflow.local", "STAFF", department],
      ["Jordan Lee", "staff2@queueflow.local", "STAFF", department],
      ["Casey Ahmed", "examstaff@queueflow.local", "STAFF", second],
      ["Demo Customer", "customer@queueflow.local", "CUSTOMER", null],
    ];
    const ids: string[] = [];
    for (const [name, email, role, dept] of roles) {
      const userId = randomUUID();
      ids.push(userId);
      await db.query(
        "INSERT INTO users(id,name,email,role,department_id,password_hash) VALUES($1,$2,$3,$4,$5,$6)",
        [userId, name, email, role, dept, hashPassword(password)],
      );
    }
    const verify = randomUUID(),
      registration = randomUUID(),
      collection = randomUUID(),
      exam = randomUUID();
    await db.query(
      "INSERT INTO services(id,department_id,name,duration,prefix) VALUES($1,$5,'Document verification',10,'DV'),($2,$5,'New registration',20,'NR'),($3,$5,'Document collection',5,'DC'),($4,$6,'Examination queries',15,'EX')",
      [verify, registration, collection, exam, department, second],
    );
    await db.query(
      "INSERT INTO counters(id,department_id,name,staff_id,service_ids) VALUES($1,$2,'Counter 01',$3,$4),($5,$2,'Counter 02',$6,$4),($7,$8,'Counter 03',$9,$10)",
      [
        randomUUID(),
        department,
        ids[2],
        [verify, registration, collection],
        randomUUID(),
        ids[3],
        randomUUID(),
        second,
        ids[4],
        [exam],
      ],
    );
    console.log(
      "Seeded 2 departments, 4 services, 3 counters, and 6 accounts.",
    );
    console.log(
      "Accounts: admin@queueflow.local, manager@queueflow.local, staff@queueflow.local, staff2@queueflow.local, examstaff@queueflow.local, customer@queueflow.local",
    );
    console.log("Passwords use SEED_PASSWORD; the password is not printed.");
  });
}
seed()
  .then(closeDatabase)
  .catch(async (e) => {
    console.error(
      e instanceof Error && e.message.startsWith("Set SEED_PASSWORD")
        ? e.message
        : "Seed failed. Run db:migrate and check database configuration.",
    );
    await closeDatabase();
    process.exitCode = 1;
  });
