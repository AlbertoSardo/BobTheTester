import { Router } from "express";
import db from "../db/database.js";

const router = Router();

interface Appointment {
  id: number;
  patient_id: number;
  doctor_id: number;
  date: string;
  time: string;
  reason: string | null;
  status: string;
  created_at: string;
  patient_name?: string;
  doctor_name?: string;
}

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  is_available: number;
}

interface Patient {
  id: number;
  first_name: string;
  last_name: string;
}

// List appointments
router.get("/", (_req, res) => {
  const appointments = db
    .prepare(
      `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, d.name as doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       ORDER BY a.date, a.time`,
    )
    .all() as Appointment[];
  res.send(renderAppointmentList(appointments));
});

// Booking form
router.get("/book", (_req, res) => {
  const patients = db.prepare("SELECT id, first_name, last_name FROM patients WHERE is_active = 1").all() as Patient[];
  const doctors = db.prepare("SELECT id, name, specialty FROM doctors WHERE is_available = 1").all() as Doctor[];
  res.send(renderBookingForm(patients, doctors));
});

// Handle booking
router.post("/book", (req, res) => {
  const { patient_id, doctor_id, date, time, reason } = req.body;
  const errors: string[] = [];

  if (!patient_id) errors.push("Patient is required");
  if (!doctor_id) errors.push("Doctor is required");
  if (!date) errors.push("Date is required");
  if (!time) errors.push("Time is required");

  // Check doctor availability for that slot
  if (patient_id && doctor_id && date && time) {
    const existing = db
      .prepare("SELECT id FROM appointments WHERE doctor_id = ? AND date = ? AND time = ? AND status = 'scheduled'")
      .get(doctor_id, date, time);
    if (existing) {
      errors.push("Doctor already has an appointment at this time");
    }
  }

  if (errors.length > 0) {
    const patients = db.prepare("SELECT id, first_name, last_name FROM patients WHERE is_active = 1").all() as Patient[];
    const doctors = db.prepare("SELECT id, name, specialty FROM doctors WHERE is_available = 1").all() as Doctor[];
    res.status(400).send(renderBookingForm(patients, doctors, errors, req.body));
    return;
  }

  db.prepare("INSERT INTO appointments (patient_id, doctor_id, date, time, reason) VALUES (?, ?, ?, ?, ?)").run(
    patient_id,
    doctor_id,
    date,
    time,
    reason?.trim() || null,
  );

  res.redirect("/appointments?booked=true");
});

// View appointment
router.get("/:id", (req, res) => {
  const appointment = db
    .prepare(
      `SELECT a.*, p.first_name || ' ' || p.last_name as patient_name, d.name as doctor_name
       FROM appointments a
       JOIN patients p ON a.patient_id = p.id
       JOIN doctors d ON a.doctor_id = d.id
       WHERE a.id = ?`,
    )
    .get(req.params.id) as Appointment | undefined;

  if (!appointment) {
    res.status(404).send(renderError("Appointment not found"));
    return;
  }
  res.send(renderAppointmentDetail(appointment));
});

function renderAppointmentList(appointments: Appointment[]): string {
  const rows = appointments
    .map(
      (a) =>
        `<tr>
          <td><a href="/appointments/${a.id}">${a.date} ${a.time}</a></td>
          <td>${a.patient_name}</td>
          <td>${a.doctor_name}</td>
          <td data-testid="status-${a.id}">${a.status}</td>
        </tr>`,
    )
    .join("");

  return layout(
    "Appointments",
    `<h1>Appointments</h1>
    <a href="/appointments/book" class="btn" data-testid="book-btn">Book Appointment</a>
    <table>
      <thead><tr><th>Date/Time</th><th>Patient</th><th>Doctor</th><th>Status</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="4">No appointments scheduled.</td></tr>'}</tbody>
    </table>`,
  );
}

function renderBookingForm(
  patients: Patient[],
  doctors: Doctor[],
  errors: string[] = [],
  values: Record<string, string> = {},
): string {
  const errorHtml = errors.length
    ? `<div class="errors" data-testid="validation-errors">${errors.map((e) => `<p>${e}</p>`).join("")}</div>`
    : "";

  const patientOptions = patients
    .map((p) => `<option value="${p.id}" ${values.patient_id === String(p.id) ? "selected" : ""}>${p.last_name}, ${p.first_name}</option>`)
    .join("");

  const doctorOptions = doctors
    .map((d) => `<option value="${d.id}" ${values.doctor_id === String(d.id) ? "selected" : ""}>${d.name} (${d.specialty})</option>`)
    .join("");

  return layout(
    "Book Appointment",
    `<h1>Book Appointment</h1>
    ${errorHtml}
    <form method="POST" action="/appointments/book" data-testid="booking-form">
      <label>Patient *<select name="patient_id" data-testid="patient-select" required>
        <option value="">Select patient...</option>${patientOptions}
      </select></label>
      <label>Doctor *<select name="doctor_id" data-testid="doctor-select" required>
        <option value="">Select doctor...</option>${doctorOptions}
      </select></label>
      <label>Date *<input type="date" name="date" value="${values.date || ""}" data-testid="date" required></label>
      <label>Time *<input type="time" name="time" value="${values.time || ""}" data-testid="time" required></label>
      <label>Reason<textarea name="reason" data-testid="reason">${values.reason || ""}</textarea></label>
      <button type="submit" data-testid="submit-btn">Book Appointment</button>
    </form>
    <a href="/appointments">Back to list</a>`,
  );
}

function renderAppointmentDetail(appointment: Appointment): string {
  return layout(
    "Appointment Details",
    `<h1>Appointment Details</h1>
    <dl data-testid="appointment-details">
      <dt>Date</dt><dd>${appointment.date}</dd>
      <dt>Time</dt><dd>${appointment.time}</dd>
      <dt>Patient</dt><dd>${appointment.patient_name}</dd>
      <dt>Doctor</dt><dd>${appointment.doctor_name}</dd>
      <dt>Reason</dt><dd>${appointment.reason || "—"}</dd>
      <dt>Status</dt><dd>${appointment.status}</dd>
    </dl>
    <a href="/appointments">Back to list</a>`,
  );
}

function renderError(message: string): string {
  return layout("Error", `<h1>Error</h1><p>${message}</p><a href="/appointments">Back to list</a>`);
}

function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html><head><title>${title} - Clinic</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
  label { display: block; margin: 12px 0; }
  input, select, textarea { display: block; width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  textarea { height: 80px; }
  .btn, button { background: #4f46e5; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 8px 0; }
  .errors { background: #fee; border: 1px solid #c00; padding: 12px; border-radius: 4px; color: #c00; margin: 12px 0; }
  nav { margin-bottom: 20px; padding: 12px 0; border-bottom: 1px solid #ddd; }
  nav a { margin-right: 16px; text-decoration: none; color: #4f46e5; }
</style></head>
<body>
  <nav>
    <a href="/patients">Patients</a>
    <a href="/appointments">Appointments</a>
    <a href="/doctors">Doctors</a>
  </nav>
  ${content}
</body></html>`;
}

export default router;
