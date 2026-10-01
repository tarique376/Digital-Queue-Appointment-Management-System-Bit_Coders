"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  Clock3,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  Ticket,
  Users,
  BarChart3,
  ShieldCheck,
  ExternalLink,
  RefreshCw,
  X,
} from "lucide-react";
import type { State } from "@/lib/types";
import { Badge, Empty, Section, Stat, time, type Run } from "./ui";
import { Booking, Visits, MyQueue } from "./customer";
import { StaffQueue, Counters, Reports, Audit } from "./operations";
import Management from "./management";
const labels: Record<string, string> = {
  overview: "Overview",
  book: "Book appointment",
  queue: "Live queue",
  visits: "Appointments",
  notifications: "Notifications",
  counters: "Service counters",
  management: "Management",
  reports: "Reports & insights",
  audit: "Activity log",
};
const icons = {
  overview: LayoutDashboard,
  book: CalendarDays,
  queue: Ticket,
  visits: CalendarDays,
  notifications: Bell,
  counters: Users,
  management: Settings2,
  reports: BarChart3,
  audit: ShieldCheck,
};
export default function Workspace() {
  const [state, setState] = useState<State | null>(null),
    [loading, setLoading] = useState(true),
    [tab, setTab] = useState("overview"),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [pending, setPending] = useState(false),
    [search, setSearch] = useState(""),
    [mobile, setMobile] = useState(false),
    [reportDay, setReportDay] = useState(""),
    [online, setOnline] = useState(true),
    [setup, setSetup] = useState(false);
  const inflight = useRef(false),
    mounted = useRef(true);
  const load = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    try {
      const response = await fetch(
        `/api/state${reportDay ? `?day=${reportDay}` : ""}`,
        { cache: "no-store" },
      );
      const data = await response.json();
      if (!mounted.current) return;
      if (response.ok) {
        setState(data);
        setError("");
        setSetup(false);
        setOnline(true);
      } else if (response.status === 401) {
        setState(null);
        setSetup(false);
      } else {
        setError(data.error);
        setSetup(response.status === 503);
      }
    } catch {
      if (mounted.current) {
        setOnline(false);
        setError(
          "Connection interrupted. Your view will refresh when the connection returns.",
        );
      }
    } finally {
      inflight.current = false;
      if (mounted.current) setLoading(false);
    }
  }, [reportDay]);
  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(load, 5000);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(timer);
  }, [toast]);
  const run: Run = async (action, input) => {
    if (pending) throw new Error("Another request is in progress.");
    setPending(true);
    try {
      const response = await fetch("/api/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, input, key: crypto.randomUUID() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setToast(
        data.number
          ? `Token ${data.number} is ready.`
          : data.reference
            ? `Appointment ${data.reference} confirmed.`
            : "Changes saved.",
      );
      await load();
      return data;
    } catch (e) {
      const message = e instanceof Error ? e.message : "The request failed.";
      setToast(message);
      throw e;
    } finally {
      setPending(false);
    }
  };
  async function logout() {
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    setState(null);
    setTab("overview");
  }
  if (loading)
    return (
      <main className="initial">
        <div className="brand">
          <span className="brand-mark">q.</span>QueueFlow
        </div>
        <RefreshCw className="spin" />
        <p>Getting your workspace ready…</p>
      </main>
    );
  if (!state) return <Auth onLogin={load} setup={setup} serverError={error} />;
  const customer = state.user.role === "CUSTOMER",
    manager = ["ADMIN", "MANAGER"].includes(state.user.role);
  const navigation = customer
    ? ["overview", "book", "queue", "visits", "notifications"]
    : manager
      ? [
          "overview",
          "queue",
          "visits",
          "counters",
          "management",
          "reports",
          "audit",
          "notifications",
        ]
      : ["overview", "queue", "visits", "counters", "notifications"];
  const unread = state.notifications.filter((n) => !n.read_at).length;
  function navigate(next: string) {
    setTab(next);
    setSearch("");
    setMobile(false);
  }
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "visible" : ""}`}>
        <a className="brand" href="/">
          <span className="brand-mark">q.</span>QueueFlow
        </a>
        <div className="organization">
          <span className="organization-icon">
            <Activity size={18} />
          </span>
          <div>
            <strong>{state.settings.name}</strong>
            <small>
              {customer ? "Visitor workspace" : "Service workspace"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {navigation.map((key) => {
            const Icon = icons[key as keyof typeof icons];
            return (
              <button
                key={key}
                className={tab === key ? "active" : ""}
                onClick={() => navigate(key)}
              >
                <Icon size={19} />
                <span>{labels[key]}</span>
                {key === "notifications" && unread > 0 && <b aria-hidden="true">{unread}</b>}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="help-card">
            <div className="live-dot" />
            <strong>Service, without the wait.</strong>
            <p>Keep your place. Make the most of your time.</p>
            <a href="/display" target="_blank" rel="noreferrer">
              Open queue display <ExternalLink size={13} />
            </a>
          </div>
          <div className="profile">
            <span className="avatar">
              {state.user.name
                .split(" ")
                .map((s) => s[0])
                .slice(0, 2)
                .join("")}
            </span>
            <div>
              <strong>{state.user.name}</strong>
              <small>
                {state.user.role.toLowerCase().replaceAll("_", " ")}
              </small>
            </div>
            <button
              className="icon-button"
              aria-label="Sign out"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="mobile-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open menu"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span> <strong>{labels[tab]}</strong>
          </div>
          <div className="topbar-right">
            <span className={`connection ${online ? "" : "disconnected"}`}>
              <i />
              {online ? "Updates every 5 sec" : "Reconnecting"}
            </span>
            <button
              className="notification-button"
              aria-label={`Notifications, ${unread} unread`}
              onClick={() => navigate("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <i />}
            </button>
            <span className="avatar small">{state.user.name[0]}</span>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">
                {new Intl.DateTimeFormat("en-GB", {
                  timeZone: state.settings.timezone,
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                }).format(new Date())}
              </p>
              <h1>
                {tab === "overview"
                  ? `Hello, ${state.user.name.split(" ")[0]}`
                  : labels[tab]}
                {tab === "overview" && <span className="wave"> ✦</span>}
              </h1>
              <p>
                {tab === "overview"
                  ? "A little less waiting. A lot more doing."
                  : tab === "queue"
                    ? "Follow every turn, from arrival to completion."
                    : tab === "management"
                      ? "Keep your services, people, and schedules in sync."
                      : "Everything you need, in one place."}
              </p>
            </div>
            {customer && tab !== "book" ? (
              <button onClick={() => navigate("book")}>
                <CalendarDays size={17} />
                Book an appointment
              </button>
            ) : manager && tab === "reports" ? (
              <label className="inline-label">
                Report date
                <input
                  type="date"
                  value={
                    reportDay ||
                    new Intl.DateTimeFormat("en-CA", {
                      timeZone: state.settings.timezone,
                    }).format(new Date())
                  }
                  onChange={(e) => setReportDay(e.target.value)}
                />
              </label>
            ) : (
              <div className="date-chip">
                <Clock3 size={16} />
                {state.settings.timezone}
              </div>
            )}
          </div>
          {error && (
            <div className="alert" role="alert">
              {error}
              <button className="icon-button" onClick={load} aria-label="Retry">
                <RefreshCw size={16} />
              </button>
            </div>
          )}
          <fieldset className="workspace-fieldset" disabled={pending}>
            {tab === "overview" && (
              <Overview state={state} navigate={navigate} run={run} />
            )}
            {tab === "book" && <Booking state={state} run={run} />}
            {tab === "queue" &&
              (customer ? (
                <MyQueue state={state} run={run} />
              ) : (
                <StaffQueue state={state} run={run} />
              ))}
            {tab === "visits" && (
              <Visits
                state={state}
                run={run}
                search={search}
                setSearch={setSearch}
              />
            )}
            {tab === "counters" && <Counters state={state} run={run} />}
            {tab === "management" && <Management state={state} run={run} />}
            {tab === "reports" && <Reports state={state} />}
            {tab === "audit" && <Audit state={state} />}
            {tab === "notifications" && (
              <Section
                title="Your inbox"
                subtitle="Updates about appointments and your place in line."
              >
                {state.notifications.length ? (
                  state.notifications.map((n) => (
                    <div
                      className={`notification-row ${n.read_at ? "" : "unread"}`}
                      key={n.id}
                    >
                      <span className="notification-icon">
                        <Bell size={19} />
                      </span>
                      <div>
                        <strong>{n.title}</strong>
                        <p>{n.message}</p>
                        <small>
                          {time(n.created_at, state.settings.timezone)}
                        </small>
                      </div>
                      {!n.read_at && (
                        <button
                          className="button secondary compact"
                          onClick={() =>
                            run("notification", { id: n.id }).catch(() => {})
                          }
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <Empty
                    title="You’re all caught up"
                    detail="Appointment and queue notifications will appear here."
                  />
                )}
              </Section>
            )}
          </fieldset>
          <footer className="content-footer">
            <span>QueueFlow · A better way to wait</span>
            <span>
              Last refreshed{" "}
              {time(state.updatedAt, state.settings.timezone, false)}
            </span>
          </footer>
        </main>
      </div>
      {pending && (
        <div className="saving">
          <RefreshCw className="spin" size={15} />
          Saving…
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={19} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}

function Overview({
  state,
  navigate,
  run,
}: {
  state: State;
  navigate: (t: string) => void;
  run: Run;
}) {
  const customer = state.user.role === "CUSTOMER";
  const active = state.tokens.filter((t) =>
    ["WAITING", "CALLED", "IN_SERVICE", "SKIPPED"].includes(t.status),
  );
  const upcoming = state.appointments
    .filter((a) =>
      ["CONFIRMED", "BOOKED", "DELAYED", "WAITING", "IN_SERVICE"].includes(
        a.status,
      ),
    )
    .sort(
      (a, b) =>
        new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime(),
    );
  return (
    <>
      <div className="hero-banner">
        <div>
          <span className="pill">
            <i />
            YOUR TIME MATTERS
          </span>
          <h2>
            {customer
              ? "Your next visit, made simple."
              : "A smoother day starts here."}
          </h2>
          <p>
            {customer
              ? "Book ahead or join a digital queue. We’ll keep you in the loop."
              : "See who’s waiting, keep counters moving, and make every visit count."}
          </p>
          <button
            className="button light"
            onClick={() => navigate(customer ? "book" : "queue")}
          >
            {customer ? "Find your next appointment" : "Open the live queue"}
            <ArrowRight size={17} />
          </button>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="orbit one" />
          <div className="orbit two" />
          <div className="floating-ticket">
            <Ticket size={23} />
            <span>YOU’RE NEXT</span>
            <strong>
              Less waiting.
              <br />
              More living.
            </strong>
            <div className="ticket-dashes" />
            <span>
              YOUR PLACE IS SAVED <CheckCircle2 size={14} />
            </span>
          </div>
          <span className="spark">✦</span>
        </div>
      </div>
      <div className="stats-grid">
        {customer ? (
          <>
            <Stat
              label="Upcoming appointments"
              value={upcoming.length}
              detail="Your scheduled visits"
              icon={<CalendarDays size={18} />}
            />
            <Stat
              label="Active queue tokens"
              value={active.length}
              detail="Your place is saved"
              icon={<Ticket size={18} />}
            />
            <Stat
              label="Estimated wait"
              value={
                active[0]?.estimated_wait != null
                  ? `${active[0].estimated_wait} min`
                  : "—"
              }
              detail="Updates as the queue moves"
              icon={<Clock3 size={18} />}
            />
            <Stat
              label="Completed visits"
              value={
                state.tokens.filter((t) => t.status === "COMPLETED").length
              }
              detail="Available in your history"
              icon={<CheckCircle2 size={18} />}
            />
          </>
        ) : (
          <>
            <Stat
              label="Appointments today"
              value={state.analytics?.appointments ?? upcoming.length}
            />
            <Stat
              label="Currently waiting"
              value={
                state.analytics?.waiting ??
                active.filter((t) => t.status === "WAITING").length
              }
            />
            <Stat
              label="Active counters"
              value={
                state.analytics?.activeCounters ??
                state.counters.filter((c) =>
                  ["AVAILABLE", "BUSY"].includes(c.status),
                ).length
              }
            />
            <Stat
              label="Average wait"
              value={
                state.analytics ? `${state.analytics.averageWait} min` : "—"
              }
            />
          </>
        )}
      </div>
      <div className="two-col">
        <Section
          title={customer ? "Your upcoming visits" : "Upcoming appointments"}
          subtitle="A clear view of what comes next."
          action={
            <button className="text-button" onClick={() => navigate("visits")}>
              View all <ArrowRight size={15} />
            </button>
          }
        >
          {upcoming.length ? (
            <div>
              {upcoming.slice(0, 4).map((a) => (
                <div className="visit-row" key={a.id}>
                  <span className="calendar-icon">
                    <CalendarDays size={21} />
                  </span>
                  <div>
                    <strong>{a.service_name}</strong>
                    <small>{time(a.starts_at, state.settings.timezone)}</small>
                  </div>
                  <Badge value={a.status} />
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No upcoming appointments"
              detail="Choose a service and find a time that works for you."
            />
          )}
        </Section>
        <Section
          title={customer ? "Join a queue" : "Counter activity"}
          subtitle={
            customer
              ? "Here for a quick visit? Get a walk-in token."
              : "Current availability across your service counters."
          }
        >
          {customer ? (
            <div className="service-list">
              {state.services
                .filter(
                  (s) =>
                    s.active &&
                    state.departments.some(
                      (d) => d.id === s.department_id && d.active,
                    ),
                )
                .slice(0, 4)
                .map((s) => (
                  <div className="service-row" key={s.id}>
                    <span className="service-symbol">
                      <Ticket size={18} />
                    </span>
                    <div>
                      <strong>{s.name}</strong>
                      <small>Typical service: {s.duration} minutes</small>
                    </div>
                    <button
                      className="button secondary compact"
                      onClick={() =>
                        run("join", { serviceId: s.id })
                          .then(() => navigate("queue"))
                          .catch(() => {})
                      }
                    >
                      Get token <ArrowRight size={14} />
                    </button>
                  </div>
                ))}
            </div>
          ) : (
            <div>
              {state.counters.map((c) => (
                <div className="service-row" key={c.id}>
                  <span className="service-symbol">
                    <Users size={18} />
                  </span>
                  <div>
                    <strong>{c.name}</strong>
                    <small>
                      {
                        state.departments.find((d) => d.id === c.department_id)
                          ?.name
                      }
                    </small>
                  </div>
                  <Badge value={c.status} />
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
      <div className="tip">
        <ShieldCheck size={21} />
        <div>
          <strong>
            {customer
              ? "Your place is digital. Your time is yours."
              : "One workspace. Every step of service."}
          </strong>
          <p>
            {customer
              ? "Keep this page open for queue updates and counter calls. Arrive within your department’s check-in window."
              : "Call, start, and complete visits from the staff console. Every change updates the queue and visit history."}
          </p>
        </div>
      </div>
    </>
  );
}

function Auth({
  onLogin,
  setup,
  serverError,
}: {
  onLogin: () => Promise<void>;
  setup: boolean;
  serverError: string;
}) {
  const [mode, setMode] = useState("login"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [resetToken, setResetToken] = useState("");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("reset");
    if (token) {
      setResetToken(token);
      setMode("reset");
    }
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: mode,
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone") ?? "",
          password: form.get("password"),
          token: resetToken,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      if (mode === "forgot" || mode === "reset") {
        setError(result.message);
        if (mode === "reset") {
          setMode("login");
          window.history.replaceState({}, "", "/");
        }
      } else await onLogin();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <a href="/" className="brand">
          <span className="brand-mark">q.</span>QueueFlow
        </a>
        <div>
          <span className="pill">A BETTER WAY TO WAIT</span>
          <h1>
            Make room
            <br />
            for your day.
          </h1>
          <p>
            Appointments, digital queues, and helpful updates.
            <br />
            All the service. Less of the standing around.
          </p>
          <div className="auth-benefits">
            <span>
              <CalendarDays />
              Book a time that suits you
            </span>
            <span>
              <Ticket />
              Keep your place from anywhere
            </span>
            <span>
              <Bell />
              Know when it’s your turn
            </span>
          </div>
        </div>
        <small>Built for people. Ready for every visit.</small>
      </section>
      <section className="auth-form-area">
        <div className="auth-card">
          <span className="eyebrow">WELCOME TO QUEUEFLOW</span>
          <h2>
            {mode === "register"
              ? "Start your next visit."
              : mode === "forgot"
                ? "Reset your password."
                : mode === "reset"
                  ? "Choose a new password."
                  : "Good to see you."}
          </h2>
          <p>
            {mode === "register"
              ? "Create your account to book and track visits."
              : mode === "forgot"
                ? "Enter your account email to request a reset link."
                : "Sign in to your service workspace."}
          </p>
          {setup && (
            <div className="setup-note">
              <strong>One-time database setup</strong>
              <p>
                Add your Neon connection string to <code>.env.local</code>, then
                run <code>npm run db:migrate</code> and{" "}
                <code>npm run db:seed</code>. See <code>docs/SETUP.md</code>.
              </p>
            </div>
          )}
          {(error || serverError) && (
            <div className="alert" role="alert">
              {error || serverError}
            </div>
          )}
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Full name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
            )}
            {mode !== "reset" && (
              <label>
                Email address
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  required
                />
              </label>
            )}
            {mode !== "forgot" && (
              <label>
                Password
                <input
                  type="password"
                  name="password"
                  autoComplete={
                    mode === "login" ? "current-password" : "new-password"
                  }
                  minLength={mode === "login" ? 1 : 12}
                  maxLength={128}
                  required
                  placeholder={
                    mode === "login"
                      ? "Enter your password"
                      : "At least 12 characters"
                  }
                />
              </label>
            )}
            {mode === "register" && (
              <label>
                Phone <span className="muted">(optional)</span>
                <input name="phone" autoComplete="tel" maxLength={30} />
              </label>
            )}
            <button disabled={busy} type="submit">
              {busy
                ? "Please wait…"
                : mode === "register"
                  ? "Create account"
                  : mode === "forgot"
                    ? "Send reset link"
                    : mode === "reset"
                      ? "Update password"
                      : "Sign in"}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-links">
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "register" ? "login" : "register");
                setError("");
              }}
            >
              {mode === "register"
                ? "Already have an account? Sign in"
                : "New here? Create an account"}
            </button>
            <button
              className="text-button"
              onClick={() => {
                setMode(mode === "forgot" ? "login" : "forgot");
                setError("");
              }}
            >
              {mode === "forgot" ? "Return to sign in" : "Forgot password?"}
            </button>
          </div>
          <a className="public-link" href="/display">
            View the public queue display <ExternalLink size={13} />
          </a>
        </div>
      </section>
    </main>
  );
}
