export type Role = "CUSTOMER" | "STAFF" | "MANAGER" | "ADMIN";
export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  department_id: string | null;
  active: boolean;
}
export interface Department {
  id: string;
  name: string;
  active: boolean;
  opens: string;
  closes: string;
  break_start: string;
  break_end: string;
  workdays: number[];
  capacity: number;
  daily_limit: number;
  user_daily_limit: number;
  token_limit: number;
  checkin_before: number;
  checkin_after: number;
  cancel_minutes: number;
  horizon_days: number;
  fairness_minutes: number;
  response_minutes: number;
  accept_paused: boolean;
}
export interface Service {
  id: string;
  department_id: string;
  name: string;
  duration: number;
  prefix: string;
  active: boolean;
}
export interface Counter {
  id: string;
  department_id: string;
  name: string;
  staff_id: string | null;
  service_ids: string[];
  status: string;
  shift_start: string;
  shift_end: string;
}
export interface Appointment {
  id: string;
  reference: string;
  user_id: string;
  service_id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  checked_in_at: string | null;
  replaces_id: string | null;
  created_at: string;
  service_name?: string;
  department_id?: string;
  user_name?: string;
}
export interface Token {
  id: string;
  number: string;
  day: string;
  user_id: string;
  service_id: string;
  appointment_id: string | null;
  status: string;
  eligible_at: string;
  created_at: string;
  called_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  counter_id: string | null;
  served_by: string | null;
  service_minutes: number;
  service_name?: string;
  user_name?: string;
  department_id?: string;
  position?: number | null;
  people_ahead?: number | null;
  estimated_wait?: number | null;
  active_counters?: number;
}
export interface Notification {
  id: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
  email_status: string;
}
export interface AuditEvent {
  id: string;
  kind: string;
  actor_name: string;
  details: Record<string, unknown>;
  created_at: string;
}
export interface Analytics {
  appointments: number;
  walkins: number;
  waiting: number;
  activeCounters: number;
  completed: number;
  missed: number;
  averageWait: number;
  averageService: number;
  cancellationRate: number;
  noShowRate: number;
  hourly: { hour: string; visitors: number; queue: number }[];
  departments: { name: string; visitors: number; wait: number }[];
  services: { name: string; visitors: number }[];
  staff: { name: string; completed: number }[];
  trends: { day: string; visitors: number }[];
}
export interface State {
  user: User;
  settings: { name: string; timezone: string };
  departments: Department[];
  services: Service[];
  counters: Counter[];
  appointments: Appointment[];
  tokens: Token[];
  notifications: Notification[];
  users: User[];
  events: AuditEvent[];
  closures: {
    id: string;
    department_id: string;
    day: string;
    reason: string;
  }[];
  analytics: Analytics | null;
  updatedAt: string;
}
