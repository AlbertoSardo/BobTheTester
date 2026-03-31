import { Router } from "express";
import db from "../db/database.js";

const router = Router();

// List patients
router.get("/", (_req, res) => {
  const patients = db.prepare("SELECT * FROM patients WHERE is_active = 1 ORDER BY last_name").all();
  res.send(renderPatientList(patients as Patient[]));
});

// Registration form
router.get("/register", (_req, res) => {
  res.send(renderRegistrationForm());
});

// Handle registration
router.post("/register", (req, res) => {
  const { first_name, last_name, date_of_birth, phone } = req.body;
  const errors: string[] = [];

  if (!first_name || first_name.trim().length === 0) errors.push("First name is required");
  if (!last_name || last_name.trim().length === 0) errors.push("Last name is required");
  if (!date_of_birth) errors.push("Date of birth is required");

  if (errors.length > 0) {
    res.status(400).send(renderRegistrationForm(errors, req.body));
    return;
  }

  const stmt = db.prepare(
    "INSERT INTO patients (first_name, last_name, date_of_birth, phone) VALUES (?, ?, ?, ?)",
  );
  stmt.run(first_name.trim(), last_name.trim(), date_of_birth, phone?.trim() || null);

  res.redirect("/patients?registered=true");
});

// View patient
router.get("/:id", (req, res) => {
  const patient = db.prepare("SELECT * FROM patients WHERE id = ?").get(req.params.id) as Patient | undefined;
  if (!patient) {
    res.status(404).send(renderError("Patient not found"));
    return;
  }
  res.send(renderPatientDetail(patient));
});

interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  phone: string | null;
  created_at: string;
  is_active: number;
}

function renderPatientList(patients: Patient[]): string {
  const rows = patients
    .map(
      (p) =>
        `<tr>
          <td><a href="/patients/${p.id}">${p.last_name}, ${p.first_name}</a></td>
          <td>${p.date_of_birth}</td>
          <td>${p.phone || "—"}</td>
        </tr>`,
    )
    .join("");

  return layout(
    "Patients",
    `<h1>Patients</h1>
    <a href="/patients/register" class="btn" data-testid="register-btn">Register New Patient</a>
    <table>
      <thead><tr><th>Name</th><th>DOB</th><th>Phone</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="3">No patients registered yet.</td></tr>'}</tbody>
    </table>`,
  );
}

function renderRegistrationForm(errors: string[] = [], values: Record<string, string> = {}): string {
  const errorHtml = errors.length
    ? `<div class="errors" data-testid="validation-errors">${errors.map((e) => `<p>${e}</p>`).join("")}</div>`
    : "";

  return layout(
    "Register Patient",
    `<h1>Register New Patient</h1>
    ${errorHtml}
    <form method="POST" action="/patients/register" data-testid="registration-form">
      <label>First Name *<input type="text" name="first_name" value="${values.first_name || ""}" data-testid="first-name" required></label>
      <label>Last Name *<input type="text" name="last_name" value="${values.last_name || ""}" data-testid="last-name" required></label>
      <label>Date of Birth *<input type="date" name="date_of_birth" value="${values.date_of_birth || ""}" data-testid="dob" required></label>
      <label>Phone<input type="tel" name="phone" value="${values.phone || ""}" data-testid="phone"></label>
      <button type="submit" data-testid="submit-btn">Register</button>
    </form>
    <a href="/patients">Back to list</a>`,
  );
}

function renderPatientDetail(patient: Patient): string {
  return layout(
    `${patient.first_name} ${patient.last_name}`,
    `<h1>${patient.first_name} ${patient.last_name}</h1>
    <dl data-testid="patient-details">
      <dt>Date of Birth</dt><dd>${patient.date_of_birth}</dd>
      <dt>Phone</dt><dd>${patient.phone || "—"}</dd>
      <dt>Status</dt><dd>${patient.is_active ? "Active" : "Inactive"}</dd>
      <dt>Registered</dt><dd>${patient.created_at}</dd>
    </dl>
    <a href="/patients">Back to list</a>`,
  );
}

function renderError(message: string): string {
  return layout("Error", `<h1>Error</h1><p>${message}</p><a href="/patients">Back to list</a>`);
}

function layout(title: string, content: string): string {
  return `<!DOCTYPE html>
<html><head><title>${title} - Clinic</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; }
  th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; }
  label { display: block; margin: 12px 0; }
  input { display: block; width: 100%; padding: 8px; margin-top: 4px; box-sizing: border-box; }
  .btn, button { background: #4f46e5; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; text-decoration: none; display: inline-block; margin: 8px 0; }
  .errors { background: #fee; border: 1px solid #c00; padding: 12px; border-radius: 4px; color: #c00; margin: 12px 0; }
  dl { margin: 16px 0; }
  dt { font-weight: bold; margin-top: 8px; }
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
