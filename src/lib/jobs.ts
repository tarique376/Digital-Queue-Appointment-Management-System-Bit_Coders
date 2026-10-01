import { randomUUID } from "node:crypto";
import nodemailer from "nodemailer";
import { DateTime } from "luxon";
import { database, transaction } from "./db";
import { audit, notify, settings, enrichTokens } from "./domain";
import type { Appointment, Department, Token, Counter, Service } from "./types";
export async function runJobs(now = new Date()) {
  const result = await transaction(async (db) => {
    const config = await settings(db);
    let missed = 0,
      reminders = 0;
    const appointments = (
      await db.query<
        Appointment & { checkin_after: number; service_name: string }
      >(
        "SELECT a.*,d.checkin_after,s.name AS service_name FROM appointments a JOIN services s ON s.id=a.service_id JOIN departments d ON d.id=s.department_id WHERE a.status IN ('BOOKED','CONFIRMED','DELAYED')",
      )
    ).rows;
    for (const a of appointments) {
      const start = new Date(a.starts_at).getTime();
      if (now.getTime() > start + a.checkin_after * 60000) {
        await db.query("UPDATE appointments SET status='MISSED' WHERE id=$1", [
          a.id,
        ]);
        await notify(
          db,
          a.user_id,
          "Appointment missed",
          `${a.reference} was missed because the check-in window ended.`,
          `${a.id}:missed`,
          a.id,
        );
        await audit(db, null, a.id, "appointment.expired");
        missed++;
      } else if (start > now.getTime() && start - now.getTime() <= 60 * 60000) {
        await notify(
          db,
          a.user_id,
          "Appointment reminder",
          `${a.reference}: ${a.service_name} at ${DateTime.fromJSDate(new Date(a.starts_at)).setZone(config.timezone).toFormat("hh:mm a")}.`,
          `${a.id}:reminder`,
          a.id,
        );
        reminders++;
      }
    }
    const tokens = (
      await db.query<Token>(
        "SELECT * FROM tokens WHERE status IN ('WAITING','CALLED','IN_SERVICE','SKIPPED')",
      )
    ).rows;
    const departments = (
      await db.query<Department>("SELECT * FROM departments")
    ).rows;
    const services = (await db.query<Service>("SELECT * FROM services")).rows;
    const counters = (await db.query<Counter>("SELECT * FROM counters")).rows;
    const closedToday=(await db.query<{department_id:string}>('SELECT department_id FROM closures WHERE day=$1',[DateTime.fromJSDate(now).setZone(config.timezone).toISODate()])).rows.map(c=>c.department_id);
    for (const t of enrichTokens(
      tokens,
      departments,
      services,
      counters,
      config.timezone,
      now,
      closedToday,
    )) {
      if (
        t.status === "WAITING" &&
        t.position &&
        t.position <= 3 &&
        t.active_counters
      ) {
        await notify(
          db,
          t.user_id,
          "Your turn is getting close",
          `${t.number}: ${t.people_ahead} people ahead. Keep an eye on your queue.`,
          `${t.id}:approaching`,
        );
      }
    }
    // Prevent unattended prior-day walk-ins from silently blocking tomorrow's queues.
    const today = DateTime.fromJSDate(now).setZone(config.timezone).toISODate();
    for (const t of tokens) {
      if (
        !t.appointment_id &&
        ["WAITING", "SKIPPED"].includes(t.status) &&
        String(t.day).slice(0, 10) !== today
      ) {
        await db.query(
          "UPDATE tokens SET status='MISSED',completed_at=$2 WHERE id=$1",
          [t.id, now.toISOString()],
        );
        await notify(
          db,
          t.user_id,
          "Queue token expired",
          `${t.number} expired at the end of its service day.`,
          `${t.id}:day-expired`,
        );
        await audit(db, null, t.id, "token.day_expired");
      }
    }
    await db.query("DELETE FROM sessions WHERE expires_at<now()");
    await db.query("DELETE FROM auth_attempts WHERE resets_at<now()");
    await db.query("DELETE FROM password_resets WHERE expires_at<now()");
    return { missed, reminders };
  });
  const mailConfigured = !!process.env.SMTP_HOST && !!process.env.SMTP_FROM;
  if (!mailConfigured) {
    await database().query(
      "UPDATE notifications SET email_status='DISABLED' WHERE email_status='PENDING'",
    );
    return { ...result, email: "disabled" };
  }
  const messages = await transaction(async (db) => {
    // Superseded booking reminders/confirmations must not be delivered after cancellation or reschedule.
    await db.query(
      "UPDATE notifications n SET email_status='DISABLED' FROM appointments a WHERE n.appointment_id=a.id AND a.status IN ('CANCELLED','RESCHEDULED','MISSED') AND n.title IN ('Appointment reminder','Appointment confirmed','Appointment rescheduled','Appointment delayed') AND n.email_status IN ('PENDING','FAILED')",
    );
    const pending = (
      await db.query<{
        id: string;
        email: string;
        title: string;
        message: string;
      }>(
        "SELECT n.id,u.email,n.title,n.message FROM notifications n JOIN users u ON u.id=n.user_id WHERE u.active=true AND n.attempts<5 AND (n.email_status IN ('PENDING','FAILED') OR (n.email_status='SENDING' AND n.last_attempt_at<now()-interval '10 minutes')) AND (n.last_attempt_at IS NULL OR n.last_attempt_at<now()-interval '2 minutes') ORDER BY n.created_at LIMIT 20",
      )
    ).rows;
    for (const n of pending)
      await db.query(
        "UPDATE notifications SET email_status='SENDING',attempts=attempts+1,last_attempt_at=now() WHERE id=$1",
        [n.id],
      );
    return pending;
  });
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_PORT === "465",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
  });
  for (const n of messages) {
    try {
      await transport.sendMail({
        from: process.env.SMTP_FROM,
        to: n.email,
        subject: n.title,
        text: n.message,
        messageId: `<${n.id}@queueflow.local>`,
      });
      await database().query(
        "UPDATE notifications SET email_status='SENT',error=NULL WHERE id=$1",
        [n.id],
      );
    } catch {
      await database().query(
        "UPDATE notifications SET email_status='FAILED',error='Email provider rejected or timed out' WHERE id=$1",
        [n.id],
      );
    }
  }
  return { ...result, email: messages.length, runId: randomUUID() };
}
