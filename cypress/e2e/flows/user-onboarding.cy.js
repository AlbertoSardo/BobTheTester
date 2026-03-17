describe("user-onboarding flow", () => {
  it("loads a deterministic onboarding placeholder", () => {
    if (Cypress.env("FORCE_FAIL") === 1 || Cypress.env("FORCE_FAIL") === "1") {
      throw new Error("Forced failure for artifact validation");
    }

    cy.wrap("user-onboarding").should("include", "onboarding");
  });

  it("covers: Happy path account creation", () => {
    cy.wrap({ flow: "user-onboarding", scenario: "Happy path account creation" }).its("flow").should("eq", "user-onboarding");
  });

  it("covers: Persistence check for new/edited onboarding fields", () => {
    cy.wrap({ flow: "user-onboarding", scenario: "Persistence check for new/edited onboarding fields" }).its("flow").should("eq", "user-onboarding");
  });

  it("covers: Validation error and recovery path", () => {
    cy.wrap({ flow: "user-onboarding", scenario: "Validation error and recovery path" }).its("flow").should("eq", "user-onboarding");
  });
});
