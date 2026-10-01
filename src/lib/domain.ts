import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import { z } from "zod";
import { database, transaction, type DB } from "./db";
import { ensure, AppError } from "./errors";
import { localDay, windowAt, inWorkingWindow, isOpen } from "./time";
import { hashPassword } from "./auth";
import type {
  User,
  Department,
  Service,
  Counter,
  Appointment,
  Token,
  State,
  Analytics,
} from "./types";
const id = z.string().uuid();
const name = z.string().trim().min(2).max(100);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const stamp = z.string().datetime({ offset: true });
const departmentSchema = z.object({
  id: id.optional(),
  name,
  active: z.boolean(),
  opens: clock,
  closes: clock,
  break_start: clock,
  break_end: clock,
  workdays: z.array(z.number().int().min(1).max(7)).min(1),
  capacity: z.number().int().min(1).max(100),
  daily_limit: z.number().int().min(1).max(10000),
  user_daily_limit: z.number().int().min(1).max(50),
  token_limit: z.number().int().min(1).max(10),
  checkin_before: z.number().int().min(0).max(120),
  checkin_after: z.number().int().min(0).max(120),
  cancel_minutes: z.number().int().min(0).max(1440),
  horizon_days: z.number().int().min(1).max(365),
  fairness_minutes: z.number().int().min(1).max(240),
  response_minutes: z.number().int().min(1).max(60),
  accept_paused: z.boolean(),
});
const schemas = {
  book: z.object({ serviceId: id, start: stamp }),
  reschedule: z.object({ appointmentId: id, start: stamp }),
  cancel: z.object({ appointmentId: id }),
  checkin: z.object({ appointmentId: id }),
  delay: z.object({ appointmentId: id, start: stamp }),
  join: z.object({ serviceId: id }),
  cancelToken: z.object({ tokenId: id }),
  call: z.object({ counterId: id }),
  start: z.object({ tokenId: id }),
  complete: z.object({ tokenId: id }),
  skip: z.object({ tokenId: id }),
  recall: z.object({ tokenId: id }),
  miss: z.object({ tokenId: id }),
  counterStatus: z.object({
    counterId: id,
    status: z.enum(["AVAILABLE", "BREAK", "CLOSED"]),
  }),
  department: departmentSchema,
  service: z.object({
    id: id.optional(),
    department_id: id,
    name,
    duration: z.number().int().min(5).max(240),
    prefix: z.string().regex(/^[A-Z]{1,4}$/),
    active: z.boolean(),
  }),
  counter: z.object({
    id: id.optional(),
    department_id: id,
    name,
    staff_id: id.nullable(),
    service_ids: z.array(id).min(1),
    shift_start: clock,
    shift_end: clock,
  }),
  user: z.object({
    id: id.optional(),
    name,
    email: z
      .string()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    phone: z.string().max(30),
    role: z.enum(["CUSTOMER", "STAFF", "MANAGER", "ADMIN"]),
    department_id: id.nullable(),
    active: z.boolean(),
    password: z.string().min(12).max(128).optional(),
  }),
  closure: z.object({ department_id: id, day, reason: name }),
  deleteClosure: z.object({ id }),
  notification: z.object({ id }),
  settings: z.object({ name, timezone: z.string().min(1).max(80) }),
};
type Action = keyof typeof schemas;
const activeAppointment =
  "('BOOKED','CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','DELAYED')";
const activeToken = "('WAITING','CALLED','IN_SERVICE','SKIPPED')";
export async function audit(
  db: DB,
  actor: string | null,
  entity: string,
  kind: string,
  details: unknown = {},
) {
  await db.query(
    "INSERT INTO events(id,actor_id,entity_id,kind,details) VALUES($1,$2,$3,$4,$5)",
    [randomUUID(), actor, entity, kind, JSON.stringify(details)],
  );
}
export async function notify(
  db: DB,
  userId: string,
  title: string,
  message: string,
  key: string,
  appointmentId: string | null = null,
) {
  await db.query(
    "INSERT INTO notifications(id,user_id,title,message,event_key,appointment_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(event_key) DO NOTHING",
    [randomUUID(), userId, title, message, key, appointmentId],
  );
}
export async function settings(db: DB) {
  return (
    await db.query<{ name: string; timezone: string }>(
      "SELECT name,timezone FROM settings WHERE id=1",
    )
  ).rows[0];
}
function scope(user: User, departmentId: string) {
  ensure(
    user.role === "ADMIN" || user.department_id === departmentId,
    "You do not have access to this department.",
    403,
  );
}
function manage(user: User, departmentId: string) {
  ensure(
    ["ADMIN", "MANAGER"].includes(user.role),
    "Manager access required.",
    403,
  );
  scope(user, departmentId);
}
function staff(user: User, departmentId: string) {
  ensure(
    ["STAFF", "MANAGER", "ADMIN"].includes(user.role),
    "Staff access required.",
    403,
  );
  scope(user, departmentId);
}
async function serviceContext(db: DB, serviceId: string) {
  const service = (
    await db.query<Service>("SELECT * FROM services WHERE id=$1", [serviceId])
  ).rows[0];
  ensure(service, "Service not found.", 404);
  const department = (
    await db.query<Department>("SELECT * FROM departments WHERE id=$1", [
      service.department_id,
    ])
  ).rows[0];
  return { service, department };
}
function availableCounter(c: Counter, now: DateTime) {
  const time = now.toFormat("HH:mm");
  return (
    ["AVAILABLE", "BUSY"].includes(c.status) &&
    !!c.staff_id &&
    time >= c.shift_start &&
    time < c.shift_end
  );
}
async function counterAccess(db: DB, user: User, counterId: string) {
  const c = (
    await db.query<Counter>("SELECT * FROM counters WHERE id=$1", [counterId])
  ).rows[0];
  ensure(c, "Counter not found.", 404);
  staff(user, c.department_id);
  if (user.role === "STAFF")
    ensure(c.staff_id === user.id, "Use your assigned counter.", 403);
  return c;
}
async function appointmentAccess(db: DB, user: User, appointmentId: string) {
  const a = (
    await db.query<Appointment & { department_id: string }>(
      "SELECT a.*,s.department_id FROM appointments a JOIN services s ON s.id=a.service_id WHERE a.id=$1",
      [appointmentId],
    )
  ).rows[0];
  ensure(a, "Appointment not found.", 404);
  if (user.role === "CUSTOMER")
    ensure(a.user_id === user.id, "This is not your appointment.", 403);
  else staff(user, a.department_id);
  return a;
}
async function tokenAccess(
  db: DB,
  user: User,
  tokenId: string,
  customer = false,
) {
  const t = (
    await db.query<Token & { department_id: string }>(
      "SELECT t.*,s.department_id FROM tokens t JOIN services s ON s.id=t.service_id WHERE t.id=$1",
      [tokenId],
    )
  ).rows[0];
  ensure(t, "Token not found.", 404);
  if (customer && user.role === "CUSTOMER")
    ensure(t.user_id === user.id, "This is not your token.", 403);
  else {
    staff(user, t.department_id);
    if (user.role === "STAFF") {
      if (t.counter_id) await counterAccess(db, user, t.counter_id);
      else {
        const own = (
          await db.query<Counter>("SELECT * FROM counters WHERE staff_id=$1", [
            user.id,
          ])
        ).rows[0];
        ensure(
          own?.service_ids.includes(t.service_id),
          "This token is outside your service assignment.",
          403,
        );
      }
    }
  }
  return t;
}
export async function slots(
  serviceId: string,
  date: string,
  db: DB = database(),
  now = new Date(),
) {
  day.parse(date);
  const { service, department } = await serviceContext(db, serviceId);
  const config = await settings(db);
  const today = DateTime.fromJSDate(now)
    .setZone(config.timezone)
    .startOf("day");
  const selected = DateTime.fromISO(date, { zone: config.timezone });
  ensure(selected.isValid, "Invalid date.");
  if (
    !service.active ||
    !isOpen(department, date, config.timezone) ||
    selected < today ||
    selected > today.plus({ days: department.horizon_days }) ||
    (
      await db.query(
        "SELECT id FROM closures WHERE department_id=$1 AND day=$2",
        [department.id, date],
      )
    ).rows.length
  )
    return [];
  const booked = (
    await db.query<Appointment>(
      `SELECT a.* FROM appointments a JOIN services s ON s.id=a.service_id WHERE s.department_id=$1 AND a.status IN ${activeAppointment} AND a.starts_at>=$2 AND a.starts_at<$3`,
      [
        department.id,
        selected.toUTC().toISO(),
        selected.plus({ days: 1 }).toUTC().toISO(),
      ],
    )
  ).rows;
  const counters = (
    await db.query<Counter>(
      "SELECT * FROM counters WHERE department_id=$1 AND staff_id IS NOT NULL",
      [department.id],
    )
  ).rows;
  const result: {
    start: string;
    end: string;
    available: number;
    capacity: number;
  }[] = [];
  for (
    let start = windowAt(date, department.opens, config.timezone);
    start < windowAt(date, department.closes, config.timezone);
    start = start.plus({ minutes: service.duration })
  ) {
    const end = start.plus({ minutes: service.duration });
    if (
      start.toMillis() <= now.getTime() ||
      !inWorkingWindow(department, start, end)
    )
      continue;
    // Shared department capacity reserves all occupied intervals, including different services.
    const overlapping = booked.filter(
      (a) =>
        new Date(a.starts_at).getTime() < end.toMillis() &&
        new Date(a.ends_at).getTime() > start.toMillis(),
    );
    const compatible = counters.filter(
      (c) =>
        c.service_ids.includes(service.id) &&
        c.shift_start <= start.toFormat("HH:mm") &&
        c.shift_end >= end.toFormat("HH:mm"),
    );
    const capacity = Math.min(department.capacity, compatible.length);
    // Conservative reservation: every overlapping department appointment consumes
    // one place in this service's compatible pool. This avoids shared-counter
    // overbooking without relying on an unimplemented optimal matching algorithm.
    const available = Math.max(
      0,
      Math.min(
        capacity - overlapping.length,
        department.daily_limit - booked.length,
      ),
    );
    result.push({
      start: start.toUTC().toISO()!,
      end: end.toUTC().toISO()!,
      available,
      capacity,
    });
  }
  return result;
}
async function reserve(
  db: DB,
  userId: string,
  serviceId: string,
  startISO: string,
  now: Date,
  replace?: Appointment,
  delayed = false,
) {
  const { service, department } = await serviceContext(db, serviceId);
  const config = await settings(db);
  const date = localDay(startISO, config.timezone);
  const start = DateTime.fromISO(startISO).toUTC();
  ensure(start.isValid, "Invalid appointment time.");
  const choices = await slots(serviceId, date, db, now);
  const choice = choices.find(
    (s) => new Date(s.start).getTime() === start.toMillis(),
  );
  ensure(
    choice && choice.available > 0,
    "This slot is full or unavailable. Choose another time.",
    409,
  );
  const end = start.plus({ minutes: service.duration });
  const overlap = (
    await db.query(
      `SELECT id FROM appointments WHERE user_id=$1 AND status IN ${activeAppointment} AND starts_at<$2 AND ends_at>$3 AND ($4::uuid IS NULL OR id<>$4)`,
      [userId, end.toISO(), start.toISO(), replace?.id ?? null],
    )
  ).rows;
  ensure(!overlap.length, "You already have an overlapping appointment.", 409);
  const localStart = DateTime.fromISO(date, { zone: config.timezone });
  const count = (
    await db.query<{ count: string }>(
      `SELECT count(*) FROM appointments WHERE user_id=$1 AND status IN ${activeAppointment} AND starts_at>=$2 AND starts_at<$3 AND ($4::uuid IS NULL OR id<>$4)`,
      [
        userId,
        localStart.toUTC().toISO(),
        localStart.plus({ days: 1 }).toUTC().toISO(),
        replace?.id ?? null,
      ],
    )
  ).rows[0];
  ensure(
    Number(count.count) < department.user_daily_limit,
    "Your daily appointment limit has been reached.",
    409,
  );
  const appointmentId = randomUUID();
  const reference = `AP-${randomUUID().slice(0, 8).toUpperCase()}`;
  await db.query(
    "INSERT INTO appointments(id,reference,user_id,service_id,starts_at,ends_at,status,replaces_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
    [
      appointmentId,
      reference,
      userId,
      serviceId,
      start.toISO(),
      end.toISO(),
      delayed ? "DELAYED" : "CONFIRMED",
      replace?.id ?? null,
    ],
  );
  if (replace)
    await db.query("UPDATE appointments SET status='RESCHEDULED' WHERE id=$1", [
      replace.id,
    ]);
  const title = delayed
    ? "Appointment delayed"
    : replace
      ? "Appointment rescheduled"
      : "Appointment confirmed";
  await notify(
    db,
    userId,
    title,
    `${reference}: ${service.name}, ${start.setZone(config.timezone).toFormat("dd LLL yyyy, hh:mm a")} (${config.timezone}).`,
    `${appointmentId}:confirmed`,
    appointmentId,
  );
  return { id: appointmentId, reference };
}
async function issueToken(
  db: DB,
  userId: string,
  serviceId: string,
  now: Date,
  appointment?: Appointment,
) {
  const { service, department } = await serviceContext(db, serviceId);
  const config = await settings(db);
  const current = DateTime.fromJSDate(now).setZone(config.timezone);
  const date = current.toISODate()!;
  ensure(service.active && department.active, "Service is unavailable.");
  if (!appointment) {
    ensure(
      isOpen(department, date, config.timezone) &&
        inWorkingWindow(department, current, current.plus({ minutes: 1 })),
      "The department is closed or on break.",
    );
    ensure(
      !(
        await db.query(
          "SELECT id FROM closures WHERE department_id=$1 AND day=$2",
          [department.id, date],
        )
      ).rows.length,
      "The department is closed today.",
    );
  }
  const count = Number(
    (
      await db.query<{ count: string }>(
        `SELECT count(*) FROM tokens WHERE user_id=$1 AND status IN ${activeToken}`,
        [userId],
      )
    ).rows[0].count,
  );
  ensure(
    count < department.token_limit,
    "You already have the maximum number of active tokens.",
    409,
  );
  const counters = (
    await db.query<Counter>("SELECT * FROM counters WHERE department_id=$1", [
      department.id,
    ])
  ).rows;
  ensure(
    appointment ||
      department.accept_paused ||
      counters.some(
        (c) =>
          c.service_ids.includes(serviceId) && availableCounter(c, current),
      ),
    "No active counter currently serves this service.",
    409,
  );
  const sequence = (
    await db.query<{ value: number }>(
      "INSERT INTO token_sequences(service_id,day,value) VALUES($1,$2,1) ON CONFLICT(service_id,day) DO UPDATE SET value=token_sequences.value+1 RETURNING value",
      [serviceId, date],
    )
  ).rows[0].value;
  const tokenId = randomUUID();
  const number = `${service.prefix}-${String(sequence).padStart(3, "0")}`;
  const eligible = appointment
    ? new Date(
        Math.max(now.getTime(), new Date(appointment.starts_at).getTime()),
      ).toISOString()
    : now.toISOString();
  await db.query(
    "INSERT INTO tokens(id,number,day,user_id,service_id,appointment_id,eligible_at,created_at,service_minutes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      tokenId,
      number,
      date,
      userId,
      serviceId,
      appointment?.id ?? null,
      eligible,
      now.toISOString(),
      appointment ? Math.max(1,(new Date(appointment.ends_at).getTime()-new Date(appointment.starts_at).getTime())/60000) : service.duration,
    ],
  );
  await notify(
    db,
    userId,
    "Your queue token",
    `${number} for ${service.name}. Track your turn in My queue.`,
    `${tokenId}:joined`,
  );
  return { id: tokenId, number };
}
export function orderedQueue(
  tokens: Token[],
  department: Department,
  now = new Date(),
) {
  const eligible = tokens.filter(
    (t) =>
      t.status === "WAITING" &&
      new Date(t.eligible_at).getTime() <= now.getTime(),
  );
  const score = (t: Token) =>
    !t.appointment_id &&
    now.getTime() - new Date(t.created_at).getTime() >=
      department.fairness_minutes * 60000
      ? 0
      : t.appointment_id
        ? 1
        : 2;
  return eligible.sort(
    (a, b) =>
      score(a) - score(b) ||
      new Date(a.eligible_at).getTime() - new Date(b.eligible_at).getTime() ||
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime() ||
      a.id.localeCompare(b.id),
  );
}
export async function command(
  user: User,
  action: string,
  input: unknown,
  key: string,
  now = new Date(),
) {
  ensure(action in schemas, "Unknown action.");
  id.parse(key);
  const parsed = schemas[action as Action].parse(input);
  return transaction(async (db) => {
    const fresh = (
      await db.query<User>(
        "SELECT id,name,email,phone,role,department_id,active FROM users WHERE id=$1",
        [user.id],
      )
    ).rows[0];
    ensure(fresh?.active, "Account is inactive.", 403);
    user = fresh;
    const prior = (
      await db.query<{ action: string; result: unknown }>(
        "SELECT action,result FROM requests WHERE user_id=$1 AND key=$2",
        [user.id, key],
      )
    ).rows[0];
    if (prior) {
      ensure(
        prior.action === action,
        "Request key already used for another action.",
        409,
      );
      return prior.result;
    }
    const result = await perform(db, user, action as Action, parsed, now);
    await db.query(
      "INSERT INTO requests(user_id,key,action,result) VALUES($1,$2,$3,$4)",
      [user.id, key, action, JSON.stringify(result ?? { ok: true })],
    );
    return result ?? { ok: true };
  });
}
async function perform(
  db: DB,
  user: User,
  action: Action,
  input: unknown,
  now: Date,
): Promise<unknown> {
  // Every branch parses its own contract to keep validation and TypeScript narrowing explicit.
  if (action === "book") {
    ensure(user.role === "CUSTOMER", "Use a customer account to book.", 403);
    const p = schemas.book.parse(input);
    const a = await reserve(db, user.id, p.serviceId, p.start, now);
    await audit(db, user.id, a.id, "appointment.confirmed");
    return a;
  }
  if (["reschedule", "delay"].includes(action)) {
    const p = schemas.reschedule.parse(input);
    const a = await appointmentAccess(db, user, p.appointmentId);
    const { department } = await serviceContext(db, a.service_id);
    ensure(
      ["CONFIRMED", "BOOKED", "DELAYED"].includes(a.status),
      "Only appointments awaiting check-in can be moved.",
    );
    if (action === "delay") manage(user, department.id);
    else
      ensure(
        new Date(a.starts_at).getTime() - now.getTime() >=
          department.cancel_minutes * 60000,
        "The rescheduling cutoff has passed.",
      );
    // Temporarily exclude the original reservation; rollback restores it on any failure.
    await db.query("UPDATE appointments SET status='RESCHEDULED' WHERE id=$1", [
      a.id,
    ]);
    const replacement = await reserve(
      db,
      a.user_id,
      a.service_id,
      p.start,
      now,
      a,
      action === "delay",
    );
    await audit(db, user.id, a.id, `appointment.${action}`, {
      replacement: replacement.id,
    });
    return replacement;
  }
  if (action === "cancel") {
    const p = schemas.cancel.parse(input);
    const a = await appointmentAccess(db, user, p.appointmentId);
    const { department } = await serviceContext(db, a.service_id);
    ensure(
      ["BOOKED", "CONFIRMED", "DELAYED"].includes(a.status),
      "Only appointments awaiting check-in can be cancelled.",
    );
    ensure(
      new Date(a.starts_at).getTime() - now.getTime() >=
        department.cancel_minutes * 60000,
      "The cancellation cutoff has passed.",
    );
    await db.query("UPDATE appointments SET status='CANCELLED' WHERE id=$1", [
      a.id,
    ]);
    await notify(
      db,
      a.user_id,
      "Appointment cancelled",
      `${a.reference} has been cancelled.`,
      `${a.id}:cancelled`,
      a.id,
    );
    await audit(db, user.id, a.id, "appointment.cancelled");
    return { id: a.id };
  }
  if (action === "checkin") {
    const p = schemas.checkin.parse(input);
    const a = await appointmentAccess(db, user, p.appointmentId);
    const previous = (
      await db.query<Token>("SELECT * FROM tokens WHERE appointment_id=$1", [
        a.id,
      ])
    ).rows[0];
    if (previous) return { id: previous.id, number: previous.number };
    ensure(
      ["CONFIRMED", "BOOKED", "DELAYED"].includes(a.status),
      "This appointment cannot be checked in.",
    );
    const { department } = await serviceContext(db, a.service_id);
    const diff = (now.getTime() - new Date(a.starts_at).getTime()) / 60000;
    ensure(
      diff >= -department.checkin_before && diff <= department.checkin_after,
      "Check-in is outside the permitted arrival window.",
    );
    await db.query(
      "UPDATE appointments SET status='CHECKED_IN',checked_in_at=$2 WHERE id=$1",
      [a.id, now.toISOString()],
    );
    const t = await issueToken(db, a.user_id, a.service_id, now, a);
    await db.query("UPDATE appointments SET status='WAITING' WHERE id=$1", [
      a.id,
    ]);
    await audit(db, user.id, a.id, "appointment.checked_in", { token: t.id });
    return t;
  }
  if (action === "join") {
    ensure(
      user.role === "CUSTOMER",
      "Use a customer account to join a queue.",
      403,
    );
    const p = schemas.join.parse(input);
    const t = await issueToken(db, user.id, p.serviceId, now);
    await audit(db, user.id, t.id, "token.joined");
    return t;
  }
  if (action === "call") {
    const p = schemas.call.parse(input);
    const c = await counterAccess(db, user, p.counterId);
    ensure(
      c.status === "AVAILABLE",
      "Counter must be available before calling.",
    );
    const config = await settings(db);
    ensure(
      availableCounter(c, DateTime.fromJSDate(now).setZone(config.timezone)),
      "Counter has no staff or is outside its shift.",
    );
    const department = (
      await db.query<Department>("SELECT * FROM departments WHERE id=$1", [
        c.department_id,
      ])
    ).rows[0];
    const current = DateTime.fromJSDate(now).setZone(config.timezone);
    ensure(
      isOpen(department, current.toISODate()!, config.timezone) &&
        inWorkingWindow(department, current, current.plus({ minutes: 1 })),
      "Department is closed or on break.",
    );
    ensure(
      !(
        await db.query(
          "SELECT id FROM closures WHERE department_id=$1 AND day=$2",
          [department.id, current.toISODate()],
        )
      ).rows.length,
      "Department is closed today.",
    );
    const waiting = (
      await db.query<Token>(
        "SELECT * FROM tokens WHERE status='WAITING' AND service_id=ANY($1::uuid[])",
        [c.service_ids],
      )
    ).rows;
    const next = orderedQueue(waiting, department, now)[0];
    ensure(next, "No eligible customers are waiting.", 409);
    await db.query(
      "UPDATE tokens SET status='CALLED',called_at=$2,counter_id=$3,served_by=$4 WHERE id=$1",
      [next.id, now.toISOString(), c.id, c.staff_id],
    );
    await db.query("UPDATE counters SET status='BUSY' WHERE id=$1", [c.id]);
    await notify(
      db,
      next.user_id,
      "It is your turn",
      `${next.number}: please proceed to ${c.name}.`,
      `${next.id}:called:${randomUUID()}`,
    );
    await audit(db, user.id, next.id, "token.called", { counter: c.name });
    return { id: next.id, number: next.number };
  }
  if (
    ["start", "complete", "skip", "recall", "miss", "cancelToken"].includes(
      action,
    )
  ) {
    const p = schemas.start.parse(input);
    const t = await tokenAccess(db, user, p.tokenId, action === "cancelToken");
    let status = "";
    if (action === "start") {
      ensure(t.status === "CALLED", "Call this token before starting service.");
      status = "IN_SERVICE";
      await db.query("UPDATE tokens SET started_at=$2 WHERE id=$1", [
        t.id,
        now.toISOString(),
      ]);
    }
    if (action === "complete") {
      ensure(t.status === "IN_SERVICE", "Start service before completing it.");
      status = "COMPLETED";
      await db.query("UPDATE tokens SET completed_at=$2 WHERE id=$1", [
        t.id,
        now.toISOString(),
      ]);
    }
    if (action === "skip") {
      ensure(t.status === "CALLED", "Only a called token can be skipped.");
      status = "SKIPPED";
    }
    if (action === "miss") {
      ensure(
        ["CALLED", "SKIPPED"].includes(t.status),
        "Only called or skipped customers can be marked missed.",
      );
      const { department } = await serviceContext(db, t.service_id);
      ensure(
        t.called_at &&
          now.getTime() - new Date(t.called_at).getTime() >=
            department.response_minutes * 60000,
        "Wait for the response window before marking missed.",
      );
      status = "MISSED";
    }
    if (action === "recall") {
      ensure(
        ["CALLED", "SKIPPED"].includes(t.status),
        "Only called or skipped tokens can be recalled.",
      );
      if (t.status === "SKIPPED") {
        status = "WAITING";
        await db.query(
          "UPDATE tokens SET eligible_at=$2,counter_id=NULL WHERE id=$1",
          [t.id, now.toISOString()],
        );
      } else status = "CALLED";
      await db.query("UPDATE tokens SET called_at=$2 WHERE id=$1", [
        t.id,
        now.toISOString(),
      ]);
      await notify(
        db,
        t.user_id,
        "Token recalled",
        t.status === "SKIPPED"
          ? `${t.number} has returned to the waiting queue.`
          : `${t.number}: please proceed to your called counter.`,
        `${t.id}:recall:${randomUUID()}`,
      );
    }
    if (action === "cancelToken") {
      ensure(
        ["WAITING", "SKIPPED"].includes(t.status),
        "This token cannot be cancelled after it has been called.",
      );
      status = "CANCELLED";
    }
    await db.query("UPDATE tokens SET status=$2 WHERE id=$1", [t.id, status]);
    if (
      t.counter_id &&
      ["COMPLETED", "SKIPPED", "MISSED", "CANCELLED"].includes(status)
    )
      await db.query("UPDATE counters SET status='AVAILABLE' WHERE id=$1", [
        t.counter_id,
      ]);
    if (
      t.appointment_id &&
      ["IN_SERVICE", "COMPLETED", "MISSED", "CANCELLED"].includes(status)
    )
      await db.query("UPDATE appointments SET status=$2 WHERE id=$1", [
        t.appointment_id,
        status,
      ]);
    if (["COMPLETED", "MISSED", "CANCELLED"].includes(status))
      await notify(
        db,
        t.user_id,
        `Visit ${status.toLowerCase()}`,
        `${t.number} is ${status.toLowerCase()}.`,
        `${t.id}:${status}`,
      );
    await audit(db, user.id, t.id, `token.${action}`);
    return { id: t.id, status };
  }
  if (action === "counterStatus") {
    const p = schemas.counterStatus.parse(input);
    const c = await counterAccess(db, user, p.counterId);
    ensure(
      c.status !== "BUSY",
      "Finish or skip the current customer before pausing this counter.",
    );
    await db.query("UPDATE counters SET status=$2 WHERE id=$1", [
      c.id,
      p.status,
    ]);
    await audit(db, user.id, c.id, "counter.status", { status: p.status });
    return { id: c.id };
  }
  if (action === "department") {
    const p = schemas.department.parse(input);
    ensure(
      user.role === "ADMIN" ||
        (p.id && user.role === "MANAGER" && user.department_id === p.id),
      "You cannot manage this department.",
      403,
    );
    ensure(
      p.opens < p.closes &&
        p.break_start >= p.opens &&
        p.break_end <= p.closes &&
        p.break_start < p.break_end,
      "Working hours and break must be in order.",
    );
    const deptId = p.id ?? randomUUID();
    const values = Object.entries(p).filter(([k]) => k !== "id");
    const cols = values.map(([k]) => k);
    await db.query(
      `INSERT INTO departments(id,${cols.join(",")}) VALUES($1,${cols.map((_, i) => `$${i + 2}`).join(",")}) ON CONFLICT(id) DO UPDATE SET ${cols.map((k) => `${k}=EXCLUDED.${k}`).join(",")}`,
      [deptId, ...values.map(([, v]) => v)],
    );
    await audit(db, user.id, deptId, "department.updated", p);
    return { id: deptId };
  }
  if (action === "service") {
    const p = schemas.service.parse(input);
    manage(user, p.department_id);
    if (p.id) {
      const old = await serviceContext(db, p.id);
      manage(user, old.department.id);
      ensure(
        old.department.id === p.department_id,
        "A service cannot be moved between departments.",
      );
    }
    const serviceId = p.id ?? randomUUID();
    await db.query(
      "INSERT INTO services(id,department_id,name,duration,prefix,active) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,duration=EXCLUDED.duration,prefix=EXCLUDED.prefix,active=EXCLUDED.active",
      [serviceId, p.department_id, p.name, p.duration, p.prefix, p.active],
    );
    await audit(db, user.id, serviceId, "service.updated");
    return { id: serviceId };
  }
  if (action === "counter") {
    const p = schemas.counter.parse(input);
    manage(user, p.department_id);
    ensure(p.shift_start < p.shift_end, "Shift end must follow shift start.");
    if (p.id) {
      const old = await counterAccess(db, user, p.id);
      ensure(
        old.department_id === p.department_id,
        "A counter cannot move departments.",
      );
      ensure(
        old.status !== "BUSY",
        "Finish current service before changing assignments.",
      );
    }
    const serviceRows = (
      await db.query<Service>(
        "SELECT * FROM services WHERE id=ANY($1::uuid[])",
        [p.service_ids],
      )
    ).rows;
    ensure(
      serviceRows.length === new Set(p.service_ids).size &&
        serviceRows.every((s) => s.department_id === p.department_id),
      "Services must belong to this department.",
    );
    if (p.staff_id) {
      const employee = (
        await db.query<User>("SELECT * FROM users WHERE id=$1", [p.staff_id])
      ).rows[0];
      ensure(
        employee?.active &&
          employee.role === "STAFF" &&
          employee.department_id === p.department_id,
        "Select active staff from this department.",
      );
    }
    const counterId = p.id ?? randomUUID();
    await db.query(
      "INSERT INTO counters(id,department_id,name,staff_id,service_ids,shift_start,shift_end) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,staff_id=EXCLUDED.staff_id,service_ids=EXCLUDED.service_ids,shift_start=EXCLUDED.shift_start,shift_end=EXCLUDED.shift_end",
      [
        counterId,
        p.department_id,
        p.name,
        p.staff_id,
        p.service_ids,
        p.shift_start,
        p.shift_end,
      ],
    );
    await audit(db, user.id, counterId, "counter.updated");
    return { id: counterId };
  }
  if (action === "user") {
    const p = schemas.user.parse(input);
    ensure(
      ["ADMIN", "MANAGER"].includes(user.role),
      "Manager access required.",
      403,
    );
    if (user.role === "MANAGER") {
      ensure(
        p.role === "STAFF" && p.department_id === user.department_id,
        "Managers can manage only staff in their department.",
        403,
      );
      if (p.id) {
        const old = (
          await db.query<User>("SELECT * FROM users WHERE id=$1", [p.id])
        ).rows[0];
        ensure(
          old?.role === "STAFF" && old.department_id === user.department_id,
          "This account is outside your scope.",
          403,
        );
      }
    }
    ensure(
      p.id !== user.id,
      "Use another administrator to change your own permissions or active status.",
    );
    ensure(
      !["STAFF", "MANAGER"].includes(p.role) || p.department_id,
      "Staff and managers need a department.",
    );
    const userId = p.id ?? randomUUID();
    if (p.id) {
      const busy = (
        await db.query(
          "SELECT t.id FROM tokens t JOIN counters c ON c.id=t.counter_id WHERE c.staff_id=$1 AND t.status IN ('CALLED','IN_SERVICE')",
          [p.id],
        )
      ).rows;
      ensure(
        !busy.length,
        "Finish the assigned service before editing this account.",
      );
      await db.query(
        "UPDATE users SET name=$2,email=$3,phone=$4,role=$5,department_id=$6,active=$7 WHERE id=$1",
        [userId, p.name, p.email, p.phone, p.role, p.department_id, p.active],
      );
      await db.query(
        "UPDATE counters SET staff_id=NULL,status='CLOSED' WHERE staff_id=$1 AND ($2=false OR $3<>'STAFF' OR department_id IS DISTINCT FROM $4::uuid)",
        [userId, p.active, p.role, p.department_id],
      );
      await db.query("DELETE FROM sessions WHERE user_id=$1", [userId]);
      if (p.password)
        await db.query("UPDATE users SET password_hash=$2 WHERE id=$1", [
          userId,
          hashPassword(p.password),
        ]);
    } else {
      ensure(p.password, "A new account requires a password.");
      await db.query(
        "INSERT INTO users(id,name,email,phone,role,department_id,active,password_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          userId,
          p.name,
          p.email,
          p.phone,
          p.role,
          p.department_id,
          p.active,
          hashPassword(p.password),
        ],
      );
    }
    await audit(db, user.id, userId, "user.updated", {
      role: p.role,
      active: p.active,
    });
    return { id: userId };
  }
  if (action === "closure") {
    const p = schemas.closure.parse(input);
    manage(user, p.department_id);
    const closureId = randomUUID();
    await db.query(
      "INSERT INTO closures(id,department_id,day,reason) VALUES($1,$2,$3,$4) ON CONFLICT(department_id,day) DO UPDATE SET reason=EXCLUDED.reason",
      [closureId, p.department_id, p.day, p.reason],
    );
    await audit(db, user.id, p.department_id, "department.closed", {
      day: p.day,
      reason: p.reason,
    });
    return { ok: true };
  }
  if (action === "deleteClosure") {
    const p = schemas.deleteClosure.parse(input);
    const c = (
      await db.query<{ department_id: string }>(
        "SELECT department_id FROM closures WHERE id=$1",
        [p.id],
      )
    ).rows[0];
    ensure(c, "Closure not found.", 404);
    manage(user, c.department_id);
    await db.query("DELETE FROM closures WHERE id=$1", [p.id]);
    await audit(db, user.id, p.id, "closure.deleted");
    return { ok: true };
  }
  if (action === "notification") {
    const p = schemas.notification.parse(input);
    await db.query(
      "UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2",
      [p.id, user.id],
    );
    return { ok: true };
  }
  if (action === "settings") {
    ensure(user.role === "ADMIN", "Administrator access required.", 403);
    const p = schemas.settings.parse(input);
    ensure(
      DateTime.now().setZone(p.timezone).isValid,
      "Invalid IANA timezone.",
    );
    await db.query("UPDATE settings SET name=$1,timezone=$2 WHERE id=1", [
      p.name,
      p.timezone,
    ]);
    await audit(db, user.id, user.id, "organization.updated", p);
    return { ok: true };
  }
  throw new AppError(400, "Unsupported command.");
}

export function enrichTokens(
  tokens: Token[],
  departments: Department[],
  services: Service[],
  counters: Counter[],
  zone: string,
  now = new Date(),
  closedDepartments: string[] = [],
) {
  const current = DateTime.fromJSDate(now).setZone(zone);
  return tokens.map((t) => {
    const s = services.find((s) => s.id === t.service_id);
    const d = departments.find((d) => d.id === s?.department_id);
    if (!s || !d) return t;
    // A shared counter may serve other services first; include all waiting work
    // competing for any counter compatible with this token.
    const compatible = counters.filter(
      (c) => !closedDepartments.includes(d.id) && c.service_ids.includes(s.id) && availableCounter(c, current) &&
        isOpen(d,current.toISODate()!,zone) && inWorkingWindow(d,current,current.plus({minutes:1})),
    );
    const sharedServiceIds = new Set(compatible.flatMap((c) => c.service_ids));
    const ordered = orderedQueue(
      tokens.filter((x) => sharedServiceIds.has(x.service_id)),
      d,
      now,
    );
    const index = ordered.findIndex((x) => x.id === t.id);
    const prior = index >= 0 ? ordered.slice(0, index) : [];
    const duration = (x: Token) => {
      const history=tokens.filter(h=>h.service_id===x.service_id&&h.status==='COMPLETED'&&h.started_at&&h.completed_at).slice(0,30);
      if(history.length>=5)return Math.max(1,history.reduce((sum,h)=>sum+(new Date(h.completed_at!).getTime()-new Date(h.started_at!).getTime())/60000,0)/history.length);
      return x.service_minutes??services.find(s=>s.id===x.service_id)?.duration??s.duration;
    };
    const busy = tokens.filter(
      (x) =>
        ["CALLED", "IN_SERVICE"].includes(x.status) &&
        compatible.some((c) => c.id === x.counter_id),
    );
    const remaining = busy.reduce(
      (sum, x) =>
        sum +
        Math.max(
          0,
          duration(x) -
            (x.started_at
              ? (now.getTime() - new Date(x.started_at).getTime()) / 60000
              : 0),
        ),
      0,
    );
    const wait =
      compatible.length && index >= 0
        ? Math.ceil(
            (prior.reduce((sum, x) => sum + duration(x), 0) + remaining) /
              compatible.length,
          )
        : null;
    return {
      ...t,
      position: index >= 0 ? index + 1 : null,
      people_ahead: index >= 0 ? index : null,
      estimated_wait: wait,
      active_counters: compatible.length,
    };
  });
}

function calculateAnalytics(
  appointments: Appointment[],
  tokens: Token[],
  counters: Counter[],
  departments: Department[],
  services: Service[],
  users: User[],
  zone: string,
  date: string,
): Analytics {
  const selected = tokens.filter((t) => localDay(t.created_at, zone) === date);
  const visits = appointments.filter(
    (a) => localDay(a.starts_at, zone) === date,
  );
  const completed = selected.filter((t) => t.status === "COMPLETED");
  const mean = (v: number[]) =>
    v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : 0;
  const wait = (t: Token) =>
    t.started_at
      ? Math.max(
          0,
          (new Date(t.started_at).getTime() -
            Math.max(
              new Date(t.created_at).getTime(),
              new Date(t.eligible_at).getTime(),
            )) /
            60000,
        )
      : 0;
  const started = selected.filter((t) => t.started_at);
  const hourly = Array.from({ length: 24 }, (_, h) => {
    const at = windowAt(date, `${String(h).padStart(2, "0")}:00`, zone)
      .plus({ minutes: 30 })
      .toMillis();
    return {
      hour: `${String(h).padStart(2, "0")}:00`,
      visitors: selected.filter(
        (t) =>
          DateTime.fromJSDate(new Date(t.created_at)).setZone(zone).hour === h,
      ).length,
      queue: tokens.filter(
        (t) =>
          new Date(t.created_at).getTime() <= at &&
          (t.started_at
            ? new Date(t.started_at).getTime()
            : t.completed_at
              ? new Date(t.completed_at).getTime()
              : Date.now()) > at &&
          !["CANCELLED", "MISSED", "SKIPPED"].includes(t.status),
      ).length,
    };
  });
  return {
    appointments: visits.length,
    walkins: selected.filter((t) => !t.appointment_id).length,
    waiting: tokens.filter((t) => t.status === "WAITING").length,
    activeCounters: counters.filter(
      (c) => ["AVAILABLE", "BUSY"].includes(c.status) && c.staff_id,
    ).length,
    completed: completed.length,
    missed: visits.filter((a) => a.status === "MISSED").length,
    averageWait: mean(started.map(wait)),
    averageService: mean(
      completed
        .filter((t) => t.started_at && t.completed_at)
        .map(
          (t) =>
            (new Date(t.completed_at!).getTime() -
              new Date(t.started_at!).getTime()) /
            60000,
        ),
    ),
    cancellationRate: visits.length
      ? Math.round(
          (visits.filter((a) => a.status === "CANCELLED").length /
            visits.length) *
            100,
        )
      : 0,
    noShowRate: visits.length
      ? Math.round(
          (visits.filter((a) => a.status === "MISSED").length / visits.length) *
            100,
        )
      : 0,
    hourly,
    departments: departments
      .map((d) => {
        const subset = selected.filter((t) =>
          services.some(
            (s) => s.id === t.service_id && s.department_id === d.id,
          ),
        );
        return {
          name: d.name,
          visitors: subset.length,
          wait: mean(subset.filter((t) => t.started_at).map(wait)),
        };
      })
      .sort((a, b) => b.visitors - a.visitors),
    services: services
      .map((s) => ({
        name: s.name,
        visitors: selected.filter((t) => t.service_id === s.id).length,
      }))
      .sort((a, b) => b.visitors - a.visitors),
    staff: users
      .filter((u) => u.role === "STAFF")
      .map((u) => ({
        name: u.name,
        completed: completed.filter((t) => t.served_by===u.id).length,
      })),
    trends: Array.from(
      { length: 7 },
      (_, i) =>
        DateTime.fromISO(date, { zone })
          .minus({ days: 6 - i })
          .toISODate()!,
    ).map((day) => ({
      day,
      visitors: tokens.filter((t) => localDay(t.created_at, zone) === day)
        .length,
    })),
  };
}

export async function getState(user: User, reportDay?: string): Promise<State> {
  const db = database();
  const config = await settings(db);
  const now = new Date();
  const date = reportDay ?? localDay(now, config.timezone);
  day.parse(date);
  ensure(
    DateTime.fromISO(date, { zone: config.timezone }).isValid,
    "Invalid report date.",
  );
  const customer = user.role === "CUSTOMER";
  const admin = user.role === "ADMIN";
  const departmentId = admin || customer ? null : user.department_id;
  const departments = (
    await db.query<Department>(
      "SELECT * FROM departments WHERE ($1::uuid IS NULL OR id=$1) ORDER BY name",
      [departmentId],
    )
  ).rows;
  const services = (
    await db.query<Service>(
      "SELECT * FROM services WHERE ($1::uuid IS NULL OR department_id=$1) ORDER BY name",
      [departmentId],
    )
  ).rows;
  const counters = (
    await db.query<Counter>(
      "SELECT * FROM counters WHERE ($1::uuid IS NULL OR department_id=$1) ORDER BY name",
      [departmentId],
    )
  ).rows;
  // Queue estimates need competitors' tokens internally. Customer responses expose only their own.
  const queue = (
    await db.query<Token>(
      `SELECT t.*,s.name AS service_name,s.department_id,u.name AS user_name FROM tokens t JOIN services s ON s.id=t.service_id JOIN users u ON u.id=t.user_id WHERE ($1::uuid IS NULL OR s.department_id=$1) AND (t.status IN ${activeToken} OR t.created_at>=($2::date-interval '7 days') OR t.created_at>=now()-interval '30 days') ORDER BY t.created_at DESC`,
      [departmentId, date],
    )
  ).rows;
  const closedToday=(await db.query<{department_id:string}>('SELECT department_id FROM closures WHERE day=$1',[localDay(now,config.timezone)])).rows.map(c=>c.department_id);
  const enriched = enrichTokens(
    queue,
    departments,
    services,
    counters,
    config.timezone,
    now,
    closedToday,
  );
  const appointments = (
    await db.query<Appointment>(
      `SELECT a.*,s.name AS service_name,s.department_id,u.name AS user_name FROM appointments a JOIN services s ON s.id=a.service_id JOIN users u ON u.id=a.user_id WHERE ($1::uuid IS NULL OR s.department_id=$1) AND ($2::uuid IS NULL OR a.user_id=$2) AND (a.status IN ${activeAppointment} OR a.starts_at>=($3::date-interval '7 days') OR a.starts_at>=now()-interval '90 days') ORDER BY a.starts_at DESC`,
      [departmentId, customer ? user.id : null, date],
    )
  ).rows;
  const users =
    customer || user.role === "STAFF"
      ? []
      : (
          await db.query<User>(
            "SELECT id,name,email,phone,role,department_id,active FROM users WHERE ($1::uuid IS NULL OR department_id=$1) ORDER BY name",
            [departmentId],
          )
        ).rows;
  const notifications = (
    await db.query<State["notifications"][number]>(
      "SELECT id,title,message,read_at,created_at,email_status FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100",
      [user.id],
    )
  ).rows;
  const events =
    customer || user.role === "STAFF"
      ? []
      : (
          await db.query<State["events"][number]>(
            `SELECT e.*,COALESCE(u.name,'System') AS actor_name FROM events e LEFT JOIN users u ON u.id=e.actor_id WHERE $1::uuid IS NULL OR u.department_id=$1 OR e.entity_id=$1 OR e.entity_id IN (SELECT id FROM services WHERE department_id=$1) OR e.entity_id IN (SELECT id FROM appointments WHERE service_id IN (SELECT id FROM services WHERE department_id=$1)) OR e.entity_id IN (SELECT id FROM tokens WHERE service_id IN (SELECT id FROM services WHERE department_id=$1)) ORDER BY e.created_at DESC LIMIT 100`,
            [departmentId],
          )
        ).rows;
  const closures = (
    await db.query<State["closures"][number]>(
      "SELECT id,department_id,day::text,reason FROM closures WHERE ($1::uuid IS NULL OR department_id=$1) AND day>=current_date ORDER BY day",
      [departmentId],
    )
  ).rows;
  const safeCounters = customer
    ? counters.map((c) => ({ ...c, staff_id: null }))
    : counters;
  const visibleTokens = customer
    ? enriched.filter((t) => t.user_id === user.id)
    : user.role === "STAFF"
      ? enriched.filter((t) =>
          counters.some(
            (c) =>
              c.staff_id === user.id && c.service_ids.includes(t.service_id),
          ),
        )
      : enriched;
  const visibleAppointments =
    user.role === "STAFF"
      ? appointments.filter((a) =>
          counters.some(
            (c) =>
              c.staff_id === user.id && c.service_ids.includes(a.service_id),
          ),
        )
      : appointments;
  return {
    user,
    settings: config,
    departments,
    services,
    counters: safeCounters,
    appointments: visibleAppointments,
    tokens: visibleTokens,
    notifications,
    users,
    events,
    closures,
    analytics:
      customer || user.role === "STAFF"
        ? null
        : calculateAnalytics(
            appointments,
            queue,
            counters,
            departments,
            services,
            users,
            config.timezone,
            date,
          ),
    updatedAt: now.toISOString(),
  };
}

export async function publicDisplay() {
  const db = database();
  const config = await settings(db);
  const { rows } = await db.query<{
    number: string;
    counter: string;
    service: string;
    status: string;
    called_at: string;
  }>(
    "SELECT t.number,c.name AS counter,s.name AS service,t.status,t.called_at FROM tokens t JOIN counters c ON c.id=t.counter_id JOIN services s ON s.id=t.service_id WHERE t.status IN ('CALLED','IN_SERVICE') ORDER BY t.called_at DESC",
  );
  return {
    organization: config.name,
    calls: rows,
    updatedAt: new Date().toISOString(),
  };
}
