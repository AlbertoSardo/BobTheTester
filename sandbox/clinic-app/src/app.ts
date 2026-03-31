import express from "express";
import patientRoutes from "./patients/routes.js";
import appointmentRoutes from "./appointments/routes.js";
import doctorRoutes from "./doctors/routes.js";

const app = express();
const PORT = process.env.PORT || 3333;

app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.redirect("/patients");
});

app.use("/patients", patientRoutes);
app.use("/appointments", appointmentRoutes);
app.use("/doctors", doctorRoutes);

const server = app.listen(PORT, () => {
  console.log(`Clinic app running at http://localhost:${PORT}`);
});

// Graceful shutdown
process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());

export { app, server };
