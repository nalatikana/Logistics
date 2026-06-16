-- Production relational schema for Smart Logistics Tracking.
-- Store timestamps in UTC. Convert to Asia/Bangkok only in UI/reporting.

CREATE TABLE users (
  id VARCHAR(40) PRIMARY KEY,
  role VARCHAR(30) NOT NULL CHECK (role IN ('Driver', 'WH_Staff', 'Terminal', 'Billing', 'Admin', 'Executive')),
  name VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Active'
);

CREATE TABLE customers (
  id VARCHAR(40) PRIMARY KEY,
  name VARCHAR(220) NOT NULL,
  tax_id VARCHAR(30),
  billing_email VARCHAR(220),
  credit_term INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE locations (
  location_id VARCHAR(40) PRIMARY KEY,
  status VARCHAR(20) NOT NULL CHECK (status IN ('Available', 'Occupied')),
  current_house_id VARCHAR(80)
);

CREATE TABLE jobs_master (
  job_id VARCHAR(50) UNIQUE NOT NULL,
  house_number VARCHAR(80) PRIMARY KEY,
  customer_id VARCHAR(40) NOT NULL REFERENCES customers(id),
  flight_no VARCHAR(40),
  flight_time TIMESTAMP NOT NULL,
  job_status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  driver_id VARCHAR(40) REFERENCES users(id),
  location_id VARCHAR(40) REFERENCES locations(location_id),
  route_type VARCHAR(40),
  product_type VARCHAR(60),
  requires_lithium_docs BOOLEAN NOT NULL DEFAULT FALSE,
  xray_status VARCHAR(30) NOT NULL DEFAULT 'Pending',
  requires_rescan BOOLEAN NOT NULL DEFAULT FALSE,
  loading_detail_uploaded BOOLEAN NOT NULL DEFAULT FALSE,
  ready_for_billing BOOLEAN NOT NULL DEFAULT FALSE,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE activity_logs (
  log_id VARCHAR(60) PRIMARY KEY,
  house_number VARCHAR(80) NOT NULL REFERENCES jobs_master(house_number),
  activity_type VARCHAR(50) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP,
  gps_lat NUMERIC(10, 7),
  gps_long NUMERIC(10, 7),
  user_id VARCHAR(40) REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE attachments (
  file_id VARCHAR(80) PRIMARY KEY,
  house_number VARCHAR(80) NOT NULL REFERENCES jobs_master(house_number),
  file_type VARCHAR(50) NOT NULL,
  url TEXT NOT NULL,
  mime_type VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE billing_documents (
  invoice_id VARCHAR(60) PRIMARY KEY,
  house_number VARCHAR(80) NOT NULL REFERENCES jobs_master(house_number),
  customer_id VARCHAR(40) NOT NULL REFERENCES customers(id),
  pdf_url TEXT,
  billing_email VARCHAR(220),
  amount NUMERIC(12, 2) NOT NULL,
  billed_date TIMESTAMP NOT NULL,
  due_date TIMESTAMP NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'Draft'
);

CREATE TABLE alerts (
  alert_id VARCHAR(60) PRIMARY KEY,
  house_number VARCHAR(80),
  severity VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  sent BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_jobs_flight ON jobs_master(flight_no);
CREATE INDEX idx_jobs_status ON jobs_master(job_status);
CREATE INDEX idx_logs_house_activity ON activity_logs(house_number, activity_type);
CREATE INDEX idx_attachments_house ON attachments(house_number);

-- BI-ready view. Power BI / Looker Studio can read this directly.
CREATE VIEW bi_activity_duration AS
SELECT
  l.log_id,
  l.house_number,
  j.customer_id,
  c.name AS customer_name,
  j.flight_no,
  j.job_status,
  l.activity_type,
  l.start_time,
  l.end_time,
  EXTRACT(EPOCH FROM (l.end_time - l.start_time)) / 60 AS duration_minutes,
  l.user_id,
  u.name AS user_name
FROM activity_logs l
JOIN jobs_master j ON j.house_number = l.house_number
JOIN customers c ON c.id = j.customer_id
LEFT JOIN users u ON u.id = l.user_id
WHERE l.end_time IS NOT NULL;

-- In PostgreSQL, wrap twin-scan in a transaction:
-- BEGIN;
-- SELECT * FROM locations WHERE location_id = :location_id FOR UPDATE;
-- UPDATE locations SET status = 'Occupied', current_house_id = :house_number WHERE location_id = :location_id AND status = 'Available';
-- UPDATE jobs_master SET location_id = :location_id, job_status = 'Inbound', updated_at = CURRENT_TIMESTAMP WHERE house_number = :house_number;
-- COMMIT;
