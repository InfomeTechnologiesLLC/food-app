# AI exercise planning and session logging

MealMind now has Today, Meals, Exercise, Pantry, and Profile tabs. Scanning remains accessible from Today and Pantry. Exercise is optional and does not consume meal-plan usage.

## Profile and development fixtures

`preferences` contains diet, allergies, nutrition goal, and budget. `body` contains optional height/weight and the weight check-in timestamp. `training` contains enabled, goal, experience, equipment, weekdays (Sunday = 0), sessionMinutes, and excludedExercises.

From `server`, run `npm run seed:kerala -- --reset --confirm` against the single-account development database. This replaces all mock data, preserves only the account ID, email and password hash, and seeds the current profile, pantry, meals, food history, exercise plan and strength workout history directly. No AI calls are made. `npm run reset:mock -- --confirm` clears mock data and resets the account to schema defaults without seeding.

The mobile dependencies include Expo SDK 57 SQLite, Network, and Crypto modules. Install dependencies, then rebuild an existing development client to include the native modules. Expo Go also bundles these modules. Web uses an in-memory session store; durable offline logging is supported on Android/iOS.

## Plan generation

The AI selects exercises and arranges a seven-day week; there are no routine templates. Its structured context includes body measurements, training preferences, and up to ten recent finished sessions with performance and feedback. Stable exercise IDs and authored instructions come from `domain/exercise.ts`, the single source for the exercise library.

The output schema and validator enforce consecutive dates, requested training/rest weekdays, available equipment, exclusions, tracking mode, no duplicate exercises, at most three sets per exercise/eighteen per day, bounded reps/rest/core holds, and a duration budget including preparation and transitions. These are conservative product constraints, not a clinically validated prescription. AI output is retried once with validation feedback; an invalid second result is never saved.

Generation produces a draft. Activation checks both the draft revision and the current active plan ID/revision transactionally. A replaced active plan is deleted in the same transaction. Editing uses optimistic revisions and revalidates against the generation profile snapshot. Changing preferences affects the next generation rather than silently rewriting existing plans. Session history remains independent of edited/deleted plans.

Meal generation receives the active training schedule and goal as a snapshot. Existing pantry, allergy, and shopping checks remain in place. Nutrition totals are food totals, with no exercise-calorie subtraction.

## Authenticated interfaces

- `PATCH /me/preferences`, `/me/body`, `/me/training`: food, body, and complete training preferences respectively.
- `GET /exercise/library`: approved exercise definitions.
- `GET /exercise/plans`: latest thirty plans, including draft and active plans.
- `POST /exercise/plans`: `{startDate, timezone}`; returns an AI draft.
- `PATCH /exercise/plans/:id`: `{title, days, revision}`; edits validated prescriptions.
- `POST /exercise/plans/:id/activate`: `{revision, activeId, activeRevision}`; activates explicitly.
- `DELETE /exercise/plans/:id`: removes a schedule without removing sessions.
- `PUT /exercise/sessions/:uuid`: `{baseRevision, operationId, session}`; records/retries an account-owned session using a client-generated UUID.
- `GET /exercise/sessions`: cursor pagination with optional `date` and `limit` (1–100).

Session payloads carry actual set values, skipped/completed states, rest intervals, notes/feedback, start/end times, original timezone/local date, and optional source-plan references. Exercise definitions are captured by the server, never accepted from the client. Changes save automatically throughout the session’s calendar day in its original timezone. At day end, sessions become read-only history, including partial sessions with no completed sets. There is no manual finish action. Starting weights are entered by users; no weights are inferred from measurements.

## Offline and conflict behavior

Native SQLite persists every change synchronously, including instructions, rest-timer deadlines, and the exact pending delivery operation. Account-scoped keys isolate sessions and cached plans/libraries. Logout removes the authenticated-view cache while retaining unsynced account-scoped workouts for the next login.

Cached authenticated views open immediately after a restart without waiting for the network. A 401 requests reauthentication while preserving the local workout. Sync runs on foreground/reconnection and periodically while the app is active, with a fifteen-second request timeout. No background execution guarantee is assumed.

The server uses compare-and-update revisions and operation IDs to avoid duplicate sessions. The client replays the same delivery after an uncertain response and keeps edits made during delivery. HTTP 409 returns the server version; users explicitly keep their local version or accept the server version. Validation errors remain visible and corrected data can be retried. Completion state comes from session records rather than plan flags.

## Verification

`npm test` covers AI validation/retry, prompt context, measurement/profile separation, SQLite reopen/account partitions, in-flight acknowledgement preservation, and existing meal/pantry logic. `npm run test:integration` runs exercise and stock suites in separate disposable MongoDB databases, then drops them. AI requests in these suites are mocked.

Mobile checks: `npx tsc --noEmit`, `npm run lint`, and Expo Android/iOS exports. Native device checks still needed: kill/reopen during an active workout, airplane-mode logging, reconnect, expired-token reauthentication, two-device conflict resolution, and timer behavior after backgrounding. Clinical review of exercise instructions and training constraints, media demonstrations, wearables, GPS, calorie estimates, automatic load progression, and durable web offline storage are outside this implementation.

Live-provider verification caught and corrected an overly complex Gemini decoder schema. Subsequent live checks encountered Gemini 503 overload; a successful live-generated plan remains to be confirmed when the configured model is available. Provider overload now returns a recoverable 503 after bounded retries.
