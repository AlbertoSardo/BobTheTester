import { Router } from "express";
import db from "../db/database.js";

const router = Router();

interface Doctor {
  id: number;
  name: string;
  specialty: string;
  is_available: number;
}

// List doctors
router.get("/", (_req, res) => {
  const doctors = db.prepare("SELECT * FROM doctors ORDER BY name").all() as Doctor[];
  res.send(renderDoctorList(doctors));
});

// Assign doctor form
router.get("/assign", (_req, res) => {
  const doctors = db.prepare("SELECT * FROM doctors ORDER BY name").all() as Doctor[];
  const patients = db
    .prepare("SELECT id, first_name, last_name FROM patients WHERE is_active = 1")
    .all() as Array<{ id: number; first_name: string; last_name: string }>;
  res.send(renderAssignForm(doctors, patients));
});

// Handle assignment (creates an appointment)
router.post("/assign", (req, res) => {
  const { doctor_id, patient_id, date, time } = req.body;
  const errors: string[] = [];

  if (!doctor_id) errors.push("Doctor is required");
  if (!patient_id) errors.push("Patient is required");
  if (!date) errors.push("Date is required");
  if (!time) errors.push("Time is required");

  if (doctor_id) {
    const doctor = db.prepare("SELECT is_available FROM doctors WHERE id = ?").get(doctor_id) as Doctor | undefined;
    if (doctor && !doctor.is_available) {
      errors.push("Selected doctor is not currently available");
    }
  }

  if (errors.length > 0) {
    const doctors = db.prepare("SELECT * FROM doctors ORDER BY name").all() as Doctor[];
    const patients = db
      .prepare("SELECT id, first_name, last_name FROM patients WHERE is_active = 1")
      .all() as Array<{ id: number; first_name: string; last_name: string }>;
    res.status(400).send(renderAssignForm(doctors, patients, errors, req.body));
    return;
  }

  db.prepare("INSERT INTO appointments (patient_id, doctor_id, date, time, reason) VALUES (?, ?, ?, ?, ?)").run(
    patient_id,
    doctor_id,
    date,
    time,
    "Doctor assignment",
  );

  res.redirect("/doctors?assigned=true");
});

// Toggle availability
router.post("/:id/toggle-availability", (req, res) => {
  const doctor = db.prepare("SELECT * FROM doctors WHERE id = ?").get(req.params.id) as Doctor | undefined;
  if (!doctor) {
    res.status(404).send("Doctor not found");
    return;
  }

  db.prepare("UPDATE doctors SET is_available = ? WHERE id = ?").run(doctor.is_available ? 0 : 1, doctor.id);
  res.redirect("/doctors");
});

function renderDoctorList(doctors: Doctor[]): string {
  const rows = doctors
    .map(
      (d) =>
        `<tr>
          <td>${d.name}</td>
          <td>${d.specialty}</td>
          <td data-testid="availability-${d.id}">${d.is_available ? "Available" : "Unavailable"}</td>
          <td>
            <form method="POST" action="/doctors/${d.id}/toggle-availability" style="display:inline">
              <button type="submit" class="btn-small" data-testid="toggle-${d.id}">
                ${d.is_available ? "Set Unavailable" : "Set Available"}
              </button>
            </form>
          </td>
        </tr>`,
    )
    .join("");

  return layout(
    "Doctors",
    `<h1>Doctors</h1>
    <a href="/doctors/assign" class="btn" data-testid="assign-btn">Assign Doctor to Patient</a>
    <table>
      <thead><tr><th>Name</th><th>Specialty</th><th>Status</th><th>Action</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`,
  );
}

function renderAssignForm(
  doctors: Doctor[],
  patients: Array<{ id: number; first_name: string; last_name: string }>,
  errors: string[] = [],
  values: Record<string, string> = {},
): string {
  const errorHtml = errors.length
    ? `<div class="errors" data-testid="validation-errors">${errors.map((e) => `<p>${e}</p>`).join("")}</div>`
    : "";

  const doctorOptions = doctors
    .map(
      (d) =>
        `<option value="${d.id}" ${values.doctor_id === String(d.id) ? "selected" : ""}>${d.name} - ${d.specialty} (${d.is_available ? "Available" : "Unavailable"})</option>`,
    )
    .join("");

  const patientOptions = patients
    .map(
      (p) =>
        `<option value="${p.id}" ${values.patient_id === String(p.id) ? "selected" : ""}>${p.last_name}, ${p.first_name}</option>`,
    )
    .join("");

  return layout(
    "Assign Doctor",
    `<h1>Assign Doctor to Patient</h1>
    ${errorHtml}
    <form method="POST" action="/doctors/assign" data-testid="assign-form">
      <label>Doctor *<select name="doctor_id" data-testid="doctor-select" required>
        <option value="">Select doctor...</option>${doctorOptions}
      </select></label>
      <label>Patient *<select name="patient_id" data-testid="patient-select" required>
        <option value="">Select patient...</option>${patientOptions}
      </select></label>
      <label>Date *<input type="date" name="date" value="${values.date || ""}" data-testid="date" required></label>
      <label>Time *<input type="time" name="time" value="${values.time || ""}" data-testid="time" required></label>
      <button type="submit" data-testid="submit-btn">Assign</button>
    </form>
    <a href="/doctors">Back to list</a>`,
  );
}

function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html><head><title>${title} - Clinic</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
  label { display: block; margin: 12px 0; }
  input, select { display: block; width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  .btn, button { background: #4f46e5; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 8px 0; }
  .btn-small { padding: 4px 12px; font-size: 0.85rem; }
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
