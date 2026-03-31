import Database from "better-sqlite3";

const db = new Database(":memory:");

db.exec(`
  CREATE TABLE patients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,
    phone TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    is_active INTEGER DEFAULT 1
  );

  CREATE TABLE doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    is_available INTEGER DEFAULT 1
  );

  CREATE TABLE appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    patient_id INTEGER NOT NULL,
    doctor_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    reason TEXT,
    status TEXT DEFAULT 'scheduled',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (patient_id) REFERENCES patients(id),
    FOREIGN KEY (doctor_id) REFERENCES doctors(id)
  );

  -- Seed data
  INSERT INTO doctors (name, specialty) VALUES
    ('Dr. Rossi', 'General Practice'),
    ('Dr. Bianchi', 'Cardiology'),
    ('Dr. Verdi', 'Pediatrics');
`);

export default db;
