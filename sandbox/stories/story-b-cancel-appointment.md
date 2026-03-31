# Story B: Allow appointment cancellation

## Summary
As a receptionist, I want to cancel a scheduled appointment so that the doctor's time slot becomes available for other patients.

## Acceptance Criteria
1. Each appointment in the list has a "Cancel" button (only for scheduled appointments)
2. Clicking "Cancel" changes the appointment status to "cancelled"
3. Cancelled appointments remain in the list but show status "cancelled"
4. The doctor's time slot becomes available again for new bookings
5. Cancellation is immediate — no confirmation dialog needed for this version

## How to simulate this PR

Apply the following changes to `sandbox/clinic-app/src/appointments/routes.ts`:

1. Add a POST route `/:id/cancel` that updates the appointment status to "cancelled"
2. Add a "Cancel" button next to each scheduled appointment in the list view
3. Only show the cancel button for appointments with status "scheduled"

### Quick patch
```bash
# From the repo root, create a branch and make the changes:
git checkout -b feature/cancel-appointment
# Then edit sandbox/clinic-app/src/appointments/routes.ts with the changes above
# Then run: /bobthetester sandbox/config/regression/business-review-policy.json
```

## Expected BobTheTester behavior
- Should detect changes in `sandbox/clinic-app/src/appointments/routes.ts`
- Should map to flow `appointment-booking`
- Should flag that the cancellation scenario is not in the current policy's `minimumRegressionCoverage`
- Should suggest adding a regression test for cancellation
- Policy coverage for `appointment-booking` should be partially covered
- `patient-registration` and `doctor-assignment` should NOT be impacted
- The suggest_missing_tests tool should flag the gap
