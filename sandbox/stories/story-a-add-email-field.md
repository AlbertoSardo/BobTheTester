# Story A: Add email field to patient registration

## Summary
As a receptionist, I want to capture the patient's email address during registration so that we can send appointment confirmations and medical reports electronically.

## Acceptance Criteria
1. The registration form has a new "Email" field (optional but validated if provided)
2. If an email is entered, it must be a valid email format
3. The email is persisted with the patient record
4. The email is displayed on the patient detail page
5. Existing patients without email are not affected

## How to simulate this PR

Apply the following changes to `sandbox/clinic-app/src/patients/routes.ts`:

1. Add `email` column to the patient interface
2. Add an email input field to the registration form (after the phone field)
3. Add email validation (if provided, must contain @)
4. Save email in the INSERT statement
5. Display email on the patient detail page

### Quick patch
```bash
# From the repo root, create a branch and make the changes:
git checkout -b feature/patient-email
# Then edit sandbox/clinic-app/src/patients/routes.ts with the changes above
# Then run: /bobthetester sandbox/config/regression/business-review-policy.json
```

## Expected BobTheTester behavior
- Should detect changes in `sandbox/clinic-app/src/patients/routes.ts`
- Should map to flow `patient-registration`
- Should flag that the happy path test might need updating (new field)
- Should flag scaffold tests as needing implementation
- Policy coverage should show `patient-registration` partially covered
- `appointment-booking` and `doctor-assignment` should NOT be impacted
