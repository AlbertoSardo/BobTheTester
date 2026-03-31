import { test, expect } from "@playwright/test";

test.describe("appointment-booking flow", () => {
  test.beforeEach(async ({ page }) => {
    // Seed a patient first so we can book appointments
    await page.goto("/patients/register");
    await page.getByTestId("first-name").fill("Test");
    await page.getByTestId("last-name").fill("Patient");
    await page.getByTestId("dob").fill("1985-01-01");
    await page.getByTestId("submit-btn").click();
    await expect(page).toHaveURL(/\/patients/);
  });

  test("Happy path appointment booking [scenario-id:happy-path] [status:implemented]", async ({ page }) => {
    await page.goto("/appointments/book");

    // Select patient and doctor
    await page.getByTestId("patient-select").selectOption({ index: 1 });
    await page.getByTestId("doctor-select").selectOption({ index: 1 });
    await page.getByTestId("date").fill("2026-04-15");
    await page.getByTestId("time").fill("10:00");
    await page.getByTestId("reason").fill("Annual checkup");
    await page.getByTestId("submit-btn").click();

    // Verify redirect to appointment list
    await expect(page).toHaveURL(/\/appointments\?booked=true/);

    // Verify appointment appears in the list
    await expect(page.getByText("Test Patient")).toBeVisible();
  });

  test("Double-booking prevention [scenario-id:double-booking] [status:scaffold]", async ({ page }) => {
    // TODO: Implement this test
    // 1. Book an appointment for a doctor at a specific time
    // 2. Try to book another appointment for the same doctor at the same time
    // 3. Verify the double-booking is rejected with an error message
    await page.goto("/appointments/book");
    expect(true).toBe(true); // placeholder
  });

  test("Validation error with missing fields [scenario-id:validation-error] [status:scaffold]", async ({ page }) => {
    // TODO: Implement this test
    // 1. Go to booking form
    // 2. Submit without selecting patient/doctor
    // 3. Verify validation errors are displayed
    await page.goto("/appointments/book");
    expect(true).toBe(true); // placeholder
  });
});
