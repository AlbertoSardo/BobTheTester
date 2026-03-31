import { test, expect } from "@playwright/test";

test.describe("patient-registration flow", () => {
  test("Happy path patient registration [scenario-id:happy-path] [status:implemented]", async ({ page }) => {
    await page.goto("/patients/register");

    // Fill out the registration form
    await page.getByTestId("first-name").fill("Mario");
    await page.getByTestId("last-name").fill("Rossi");
    await page.getByTestId("dob").fill("1990-05-15");
    await page.getByTestId("phone").fill("+39 333 1234567");
    await page.getByTestId("submit-btn").click();

    // Verify redirect to patient list
    await expect(page).toHaveURL(/\/patients\?registered=true/);

    // Verify patient appears in the list
    await expect(page.getByText("Rossi, Mario")).toBeVisible();
  });

  test("Validation error and recovery path [scenario-id:validation-error] [status:scaffold]", async ({ page }) => {
    // TODO: Implement this test
    // 1. Go to registration form
    // 2. Submit without filling required fields
    // 3. Verify validation errors are displayed
    // 4. Fill in the required fields
    // 5. Submit again and verify success
    await page.goto("/patients/register");
    expect(true).toBe(true); // placeholder
  });

  test("Persistence check after registration [scenario-id:persistence-check] [status:scaffold]", async ({ page }) => {
    // TODO: Implement this test
    // 1. Register a new patient
    // 2. Navigate away from the page
    // 3. Come back to patient list
    // 4. Verify the patient data is still there and correct
    await page.goto("/patients");
    expect(true).toBe(true); // placeholder
  });
});
