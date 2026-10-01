"use client";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Search,
  Ticket,
  Users,
} from "lucide-react";
import type { State, Appointment } from "@/lib/types";
import { Badge, Empty, Section, Modal, time, deptName, type Run } from "./ui";
type Slot = { start: string; end: string; available: number; capacity: number };
export function Booking({
  state,
  run,
  replacement,
  onDone,
}: {
  state: State;
  run: Run;
  replacement?: Appointment;
  onDone?: () => void;
}) {
  const service = state.services.find((s) => s.id === replacement?.service_id);
  const [departmentId, setDepartment] = useState(
      service?.department_id ??
        state.departments.find((d) => d.active)?.id ??
        "",
    ),
    [serviceId, setService] = useState(service?.id ?? ""),
    [date, setDate] = useState(
      DateTime.now().setZone(state.settings.timezone).toISODate()!,
    ),
    [slots, setSlots] = useState<Slot[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const chosen = state.services.find((s) => s.id === serviceId),
    department = state.departments.find((d) => d.id === departmentId);
  useEffect(() => {
    if (!serviceId) {
      setSlots([]);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSelected("");
    fetch(`/api/slots?service=${serviceId}&day=${date}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setSlots(data.slots);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [serviceId, date]);
  // Routine polling preserves selection. The server revalidates capacity on confirmation.
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    try {
      const result = (await run(
        replacement ? "reschedule" : "book",
        replacement
          ? { appointmentId: replacement.id, start: selected }
          : { serviceId, start: selected },
      )) as { reference: string };
      setSuccess(result.reference);
      onDone?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Booking failed.");
    }
  }
  if (success)
    return (
      <Section title="Your appointment is confirmed">
        <div className="booking-success">
          <CheckCircle2 size={50} />
          <h2>You’re all set.</h2>
          <p>Appointment {success}</p>
          <p>Details and check-in instructions are in your appointments.</p>
          <button
            className="button secondary"
            onClick={() => {
              setSuccess("");
              setSelected("");
            }}
          >
            Book another visit
          </button>
        </div>
      </Section>
    );
  return (
    <div className="booking-layout">
      <Section
        title={replacement ? "Choose a new appointment" : "Plan your visit"}
        subtitle="Choose your service, then find an available time."
      >
        <form onSubmit={submit} className="booking-form">
          <div className="form-grid">
            <label>
              Department
              <select aria-label="Department"
                value={departmentId}
                disabled={!!replacement}
                onChange={(e) => {
                  setDepartment(e.target.value);
                  setService("");
                }}
              >
                {state.departments
                  .filter((d) => d.active)
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Service
              <select aria-label="Service"
                value={serviceId}
                disabled={!!replacement}
                onChange={(e) => setService(e.target.value)}
                required
              >
                <option value="">Select a service</option>
                {state.services
                  .filter((s) => s.department_id === departmentId && s.active)
                  .map((s) => (
                    <option value={s.id} key={s.id}>
                      {s.name} · {s.duration} min
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Appointment date
              <input
                type="date"
                required
                min={
                  DateTime.now().setZone(state.settings.timezone).toISODate()!
                }
                max={
                  DateTime.now()
                    .setZone(state.settings.timezone)
                    .plus({ days: department?.horizon_days ?? 30 })
                    .toISODate()!
                }
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Typical service duration
              <div className="readonly-field">
                <Clock3 size={17} />
                {chosen ? `${chosen.duration} minutes` : "Choose a service"}
              </div>
            </label>
          </div>
          <div className="slot-heading">
            <h3>Available times</h3>
            <span>
              <i />
              Available <i className="full-dot" />
              Full
            </span>
          </div>
          {loading ? (
            <p className="muted">Checking availability…</p>
          ) : !serviceId ? (
            <Empty
              title="Start with a service"
              detail="Available appointment times will appear here."
            />
          ) : slots.length ? (
            <div className="slots">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  disabled={!s.available}
                  className={`slot ${selected === s.start ? "selected" : ""}`}
                  onClick={() => setSelected(s.start)}
                >
                  <strong>
                    {time(s.start, state.settings.timezone, false)}
                  </strong>
                  <small>
                    {s.available ? `${s.available} places left` : "Full"}
                  </small>
                </button>
              ))}
            </div>
          ) : (
            <Empty
              title="No times available"
              detail="Try another date. This department may be closed or on break."
            />
          )}
          {error && (
            <div className="alert" role="alert">
              {error}
            </div>
          )}
          <div className="booking-footer">
            <small>All times are in {state.settings.timezone}.</small>
            <button disabled={!selected} type="submit">
              {replacement ? "Confirm new time" : "Confirm appointment"}
              <ArrowRight size={17} />
            </button>
          </div>
        </form>
      </Section>
      <aside className="booking-aside">
        <span className="large-icon">
          <CalendarDays size={30} />
        </span>
        <h2>
          A smoother visit
          <br />
          starts here.
        </h2>
        <p>Book ahead, check in on arrival, and keep track of your turn.</p>
        <ol>
          <li>
            <strong>Choose your service</strong>
            <p>Different services have different durations.</p>
          </li>
          <li>
            <strong>Reserve your time</strong>
            <p>Your booking is confirmed only when capacity is available.</p>
          </li>
          <li>
            <strong>Arrive and check in</strong>
            <p>
              {department
                ? `Check in from ${department.checkin_before} minutes before to ${department.checkin_after} minutes after your start time.`
                : "Follow your department’s check-in window."}
            </p>
          </li>
        </ol>
      </aside>
    </div>
  );
}
export function Visits({
  state,
  run,
  search,
  setSearch,
}: {
  state: State;
  run: Run;
  search: string;
  setSearch: (s: string) => void;
}) {
  const [filter, setFilter] = useState("ALL"),
    [edit, setEdit] = useState<Appointment | null>(null),
    [cancel, setCancel] = useState<Appointment | null>(null),
    [delay, setDelay] = useState<Appointment | null>(null),
    [delayStart, setDelayStart] = useState("");
  const customer = state.user.role === "CUSTOMER";
  const data = state.appointments.filter(
    (a) =>
      (filter === "ALL" || a.status === filter) &&
      `${a.service_name} ${a.reference} ${a.user_name ?? ""} ${a.status} ${deptName(state, a.department_id ?? "")}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <>
      <Section
        title={customer ? "Your appointments" : "Appointment register"}
        subtitle="Upcoming visits and previous appointment history."
        action={<span className="count-chip">{data.length} visits</span>}
      >
        <div className="table-tools">
          <label className="search-input">
            <Search size={17} />
            <input
              aria-label="Search appointments"
              placeholder="Search service, department, reference or visitor"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filter appointment status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            {[
              "ALL",
              "CONFIRMED",
              "WAITING",
              "IN_SERVICE",
              "COMPLETED",
              "CANCELLED",
              "MISSED",
              "RESCHEDULED",
              "DELAYED",
            ].map((s) => (
              <option key={s} value={s}>
                {s === "ALL" ? "All statuses" : s.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
        {data.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Appointment</th>
                  <th>Service / visitor</th>
                  <th>Date & time</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((a) => {
                  const d = state.departments.find(
                    (d) => d.id === a.department_id,
                  );
                  const checkin = new Date(a.starts_at).getTime() - Date.now();
                  const checkinAllowed =
                    d &&
                    checkin <= d.checkin_before * 60000 &&
                    checkin >= -d.checkin_after * 60000;
                  return (
                    <tr key={a.id}>
                      <td>
                        <strong className="mono">{a.reference}</strong>
                      </td>
                      <td>
                        <strong>{a.service_name}</strong>
                        <small>
                          {customer
                            ? deptName(state, a.department_id ?? "")
                            : a.user_name}
                        </small>
                      </td>
                      <td>
                        {time(a.starts_at, state.settings.timezone)}
                        <small>
                          to {time(a.ends_at, state.settings.timezone, false)}
                        </small>
                      </td>
                      <td>
                        <Badge value={a.status} />
                      </td>
                      <td>
                        <div className="row-actions">
                          {["BOOKED", "CONFIRMED", "DELAYED"].includes(
                            a.status,
                          ) && (
                            <>
                              {checkinAllowed && (
                                <button
                                  className="button compact"
                                  onClick={() =>
                                    run("checkin", {
                                      appointmentId: a.id,
                                    }).catch(() => {})
                                  }
                                >
                                  Check in
                                </button>
                              )}
                              <button
                                className="button secondary compact"
                                onClick={() => setEdit(a)}
                              >
                                Reschedule
                              </button>
                              <button
                                className="text-button danger-text"
                                onClick={() => setCancel(a)}
                              >
                                Cancel
                              </button>
                              {["ADMIN", "MANAGER"].includes(
                                state.user.role,
                              ) && (
                                <button
                                  className="text-button"
                                  onClick={() => {
                                    setDelay(a);
                                    setDelayStart(
                                      DateTime.fromJSDate(new Date(a.starts_at))
                                        .setZone(state.settings.timezone)
                                        .toFormat("yyyy-MM-dd'T'HH:mm"),
                                    );
                                  }}
                                >
                                  Delay
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No appointments match"
            detail="Book a visit or change your search filters."
          />
        )}
      </Section>
      {edit && (
        <Modal title="Reschedule appointment" onClose={() => setEdit(null)}>
          <Booking
            state={state}
            run={run}
            replacement={edit}
            onDone={() => setEdit(null)}
          />
        </Modal>
      )}
      {cancel && (
        <Modal title="Cancel this appointment?" onClose={() => setCancel(null)}>
          <p>
            {cancel.reference} · {cancel.service_name}
          </p>
          <p>
            Cancellation follows your department’s cutoff. A successful
            cancellation releases the reservation.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              onClick={() => setCancel(null)}
            >
              Keep appointment
            </button>
            <button
              className="button danger"
              onClick={() =>
                run("cancel", { appointmentId: cancel.id })
                  .then(() => setCancel(null))
                  .catch(() => {})
              }
            >
              Cancel appointment
            </button>
          </div>
        </Modal>
      )}
      {delay && (
        <Modal title="Delay appointment" onClose={() => setDelay(null)}>
          <p>
            Move this appointment to an available generated slot. The customer
            will be notified.
          </p>
          <label>
            New local start time ({state.settings.timezone})
            <input
              type="datetime-local"
              value={delayStart}
              onChange={(e) => setDelayStart(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button
              onClick={() =>
                run("delay", {
                  appointmentId: delay.id,
                  start: DateTime.fromISO(delayStart, {
                    zone: state.settings.timezone,
                  })
                    .toUTC()
                    .toISO(),
                })
                  .then(() => setDelay(null))
                  .catch(() => {})
              }
            >
              Confirm delay
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function MyQueue({ state, run }: { state: State; run: Run }) {
  const active = state.tokens.filter((t) =>
    ["WAITING", "CALLED", "IN_SERVICE", "SKIPPED"].includes(t.status),
  );
  const history = state.tokens.filter((t) => !active.includes(t));
  return (
    <>
      <div className="queue-cards">
        {active.map((t) => (
          <section
            className={`queue-card ${t.status === "CALLED" ? "called-card" : ""}`}
            key={t.id}
          >
            <div className="queue-card-top">
              <span>
                <Ticket size={18} />
                {t.service_name}
              </span>
              <Badge value={t.status} />
            </div>
            <p className="eyebrow">YOUR TOKEN</p>
            <h2>{t.number}</h2>
            <p>
              {t.status === "CALLED"
                ? `Please proceed to ${state.counters.find((c) => c.id === t.counter_id)?.name ?? "your called counter"}.`
                : t.status === "SKIPPED"
                  ? "Your token was skipped. Ask staff to recall it."
                  : t.status === "IN_SERVICE"
                    ? "Your service is in progress."
                    : t.position
                      ? "Your place is saved. We’ll let you know when you’re next."
                      : "Waiting for your appointment time or an active counter."}
            </p>
            <div className="queue-details">
              <div>
                <Users size={18} />
                <strong>{t.people_ahead ?? "—"}</strong>
                <span>People ahead</span>
              </div>
              <div>
                <Clock3 size={18} />
                <strong>
                  {t.estimated_wait != null ? `${t.estimated_wait} min` : "—"}
                </strong>
                <span>Estimated wait</span>
              </div>
            </div>
            <small>Approximate estimate · refreshed every 5 seconds</small>
            {["WAITING", "SKIPPED"].includes(t.status) && (
              <button
                className="text-button danger-text"
                onClick={() =>
                  run("cancelToken", { tokenId: t.id }).catch(() => {})
                }
              >
                Leave this queue
              </button>
            )}
          </section>
        ))}
      </div>
      {!active.length && (
        <Section title="Your place in line">
          <Empty
            title="No active tokens"
            detail="Get a walk-in token below or check in to your appointment."
          />
        </Section>
      )}
      <Section
        title="Walk-in services"
        subtitle="Choose a service to join its digital queue."
      >
        <div className="catalog-grid">
          {state.services
            .filter(
              (s) =>
                s.active &&
                state.departments.some(
                  (d) => d.id === s.department_id && d.active,
                ),
            )
            .map((s) => (
              <div className="catalog-card" key={s.id}>
                <span className="service-symbol">
                  <Ticket />
                </span>
                <h3>{s.name}</h3>
                <p>{deptName(state, s.department_id)}</p>
                <small>
                  <Clock3 size={14} />
                  Typical service: {s.duration} min
                </small>
                <button
                  className="button secondary"
                  onClick={() =>
                    run("join", { serviceId: s.id }).catch(() => {})
                  }
                >
                  Get a token
                  <ArrowRight size={15} />
                </button>
              </div>
            ))}
        </div>
      </Section>
      <Section
        title="Queue history"
        subtitle="Your previous walk-in and appointment tokens."
      >
        {history.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Token</th>
                  <th>Service</th>
                  <th>Joined</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {history.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{t.number}</td>
                    <td>{t.service_name}</td>
                    <td>{time(t.created_at, state.settings.timezone)}</td>
                    <td>
                      <Badge value={t.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty title="No previous tokens" />
        )}
      </Section>
    </>
  );
}
