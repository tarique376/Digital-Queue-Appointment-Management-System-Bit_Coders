CREATE TABLE IF NOT EXISTS migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE settings (
  id integer PRIMARY KEY CHECK (id=1), name text NOT NULL DEFAULT 'QueueFlow',
  timezone text NOT NULL DEFAULT 'Asia/Karachi'
);
INSERT INTO settings(id) VALUES(1);
CREATE TABLE departments (
  id uuid PRIMARY KEY, name text UNIQUE NOT NULL, active boolean NOT NULL DEFAULT true,
  opens text NOT NULL DEFAULT '09:00', closes text NOT NULL DEFAULT '17:00',
  break_start text NOT NULL DEFAULT '13:00', break_end text NOT NULL DEFAULT '14:00',
  workdays integer[] NOT NULL DEFAULT '{1,2,3,4,5}', capacity integer NOT NULL DEFAULT 3 CHECK(capacity BETWEEN 1 AND 100),
  daily_limit integer NOT NULL DEFAULT 100 CHECK(daily_limit>0), user_daily_limit integer NOT NULL DEFAULT 3 CHECK(user_daily_limit>0),
  token_limit integer NOT NULL DEFAULT 1 CHECK(token_limit BETWEEN 1 AND 10),
  checkin_before integer NOT NULL DEFAULT 10 CHECK(checkin_before BETWEEN 0 AND 120),
  checkin_after integer NOT NULL DEFAULT 10 CHECK(checkin_after BETWEEN 0 AND 120),
  cancel_minutes integer NOT NULL DEFAULT 30 CHECK(cancel_minutes>=0),
  horizon_days integer NOT NULL DEFAULT 30 CHECK(horizon_days BETWEEN 1 AND 365),
  fairness_minutes integer NOT NULL DEFAULT 30 CHECK(fairness_minutes>0),
  response_minutes integer NOT NULL DEFAULT 3 CHECK(response_minutes>0),
  accept_paused boolean NOT NULL DEFAULT false,
  UNIQUE(id,name)
);
CREATE TABLE users (
  id uuid PRIMARY KEY, name text NOT NULL, email text UNIQUE NOT NULL, phone text NOT NULL DEFAULT '',
  password_hash text NOT NULL, role text NOT NULL DEFAULT 'CUSTOMER' CHECK(role IN ('CUSTOMER','STAFF','MANAGER','ADMIN')),
  department_id uuid REFERENCES departments(id), active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(role NOT IN ('STAFF','MANAGER') OR department_id IS NOT NULL)
);
CREATE TABLE sessions (id text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), expires_at timestamptz NOT NULL);
CREATE TABLE auth_attempts (key text PRIMARY KEY, count integer NOT NULL, resets_at timestamptz NOT NULL);
CREATE TABLE services (
  id uuid PRIMARY KEY, department_id uuid NOT NULL REFERENCES departments(id), name text NOT NULL,
  duration integer NOT NULL CHECK(duration BETWEEN 5 AND 240), prefix text NOT NULL CHECK(prefix ~ '^[A-Z]{1,4}$'),
  active boolean NOT NULL DEFAULT true, UNIQUE(department_id,name)
);
CREATE TABLE counters (
  id uuid PRIMARY KEY, department_id uuid NOT NULL REFERENCES departments(id), name text NOT NULL,
  staff_id uuid REFERENCES users(id), service_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'AVAILABLE' CHECK(status IN ('AVAILABLE','BUSY','BREAK','CLOSED')),
  shift_start text NOT NULL DEFAULT '09:00', shift_end text NOT NULL DEFAULT '17:00',
  UNIQUE(department_id,name)
);
CREATE UNIQUE INDEX one_counter_per_staff ON counters(staff_id) WHERE staff_id IS NOT NULL;
CREATE TABLE closures (id uuid PRIMARY KEY, department_id uuid NOT NULL REFERENCES departments(id), day date NOT NULL, reason text NOT NULL, UNIQUE(department_id,day));
CREATE TABLE appointments (
  id uuid PRIMARY KEY, reference text UNIQUE NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
  service_id uuid NOT NULL REFERENCES services(id), starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('BOOKED','CONFIRMED','CHECKED_IN','WAITING','IN_SERVICE','COMPLETED','CANCELLED','MISSED','RESCHEDULED','DELAYED')),
  checked_in_at timestamptz, replaces_id uuid REFERENCES appointments(id),
  created_at timestamptz NOT NULL DEFAULT now(), CHECK(ends_at>starts_at)
);
CREATE INDEX appointment_capacity ON appointments(service_id,starts_at,ends_at,status);
CREATE INDEX appointment_user ON appointments(user_id,starts_at);
CREATE TABLE token_sequences (service_id uuid REFERENCES services(id), day date NOT NULL, value integer NOT NULL, PRIMARY KEY(service_id,day));
CREATE TABLE tokens (
  id uuid PRIMARY KEY, number text NOT NULL, day date NOT NULL, user_id uuid NOT NULL REFERENCES users(id),
  service_id uuid NOT NULL REFERENCES services(id), appointment_id uuid UNIQUE REFERENCES appointments(id),
  status text NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING','CALLED','IN_SERVICE','COMPLETED','SKIPPED','MISSED','CANCELLED')),
  eligible_at timestamptz NOT NULL DEFAULT now(), created_at timestamptz NOT NULL DEFAULT now(),
  called_at timestamptz, started_at timestamptz, completed_at timestamptz, counter_id uuid REFERENCES counters(id),
  UNIQUE(service_id,day,number)
);
CREATE UNIQUE INDEX one_active_service_per_counter ON tokens(counter_id) WHERE status IN ('CALLED','IN_SERVICE');
CREATE INDEX queue_lookup ON tokens(service_id,status,eligible_at,created_at);
CREATE TABLE events (
  id uuid PRIMARY KEY, actor_id uuid REFERENCES users(id), entity_id uuid NOT NULL, kind text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX events_time ON events(created_at);
CREATE TABLE notifications (
  id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL, message text NOT NULL,
  event_key text UNIQUE NOT NULL, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  email_status text NOT NULL DEFAULT 'PENDING' CHECK(email_status IN ('PENDING','SENDING','SENT','FAILED','DISABLED')),
  attempts integer NOT NULL DEFAULT 0, last_attempt_at timestamptz, error text, appointment_id uuid REFERENCES appointments(id)
);
CREATE TABLE requests (user_id uuid REFERENCES users(id), key uuid NOT NULL, action text NOT NULL, result jsonb NOT NULL, PRIMARY KEY(user_id,key));
CREATE TABLE password_resets (id text PRIMARY KEY, user_id uuid REFERENCES users(id), expires_at timestamptz NOT NULL);
