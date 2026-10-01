ALTER TABLE tokens ADD COLUMN served_by uuid REFERENCES users(id);
ALTER TABLE tokens ADD COLUMN service_minutes integer NOT NULL DEFAULT 10 CHECK(service_minutes>0);
UPDATE tokens t SET service_minutes=s.duration FROM services s WHERE s.id=t.service_id;
