# MealMind mobile app

MealMind is an AI personal trainer and nutrition coach. The user enters their body details and goal once and adds pantry items (by hand or by photo). The app works out daily calorie, protein, carbs, fat and water targets, plans meals from the pantry, tracks what was eaten, plans workouts, and reminds the user through the day.

Built with Expo SDK 57, React Native, Expo Router and React Query. It talks to the MealMind API in `../server`.

## Run it

1. Start the API first (see `../server`): `npm run dev` there, with MySQL running.
2. In this folder, install packages once:
   ```bash
   npm install
   ```
3. Create `mobile/.env` with the API address your phone can reach (your PC's LAN IP, not `localhost`):
   ```
   EXPO_PUBLIC_API_URL=http://192.168.1.20:4000
   ```
4. Start Expo:
   ```bash
   npx expo start
   ```
   Open the app in a **development build** (`npx expo run:android`, or an EAS `development` build). Reminders do not work in Expo Go on Android. Press `w` for a web preview.

EAS builds take `EXPO_PUBLIC_API_URL` from the profile in `eas.json` (`development`, `preview`, `production`). Set the production one to your deployed HTTPS API before building for release.

## What is where

| Tab or screen | What it does |
|---|---|
| **Today** (`src/app/(tabs)/index.tsx`) | Today's targets vs what was eaten, advice for the rest of the day, **Log food**, water tracking, health summary, today's meals and workout |
| **Coach** (`src/app/(tabs)/coach.tsx`) | Chat with the AI coach, "What should I eat?" suggestions from the pantry, confirming food the coach estimated |
| **Meals** (`src/app/(tabs)/plans.tsx`) | AI meal plans from the pantry; mark meals as eaten |
| **Exercise** (`src/app/(tabs)/exercise.tsx`) | Weekly workout plans and logging sets (works offline) |
| **Pantry** (`src/app/(tabs)/pantry.tsx`) | Pantry items with batches and expiry; grocery and receipt scan (`scan.tsx`) |
| **Profile** (`src/app/(tabs)/settings.tsx`) | Diet, allergies, goal, **Body and goal** (height, weight, target, sex, birth year, activity, timeframe), Progress & tracking, notifications, theme |
| Onboarding, tutorial | `src/app/onboarding.tsx`, `src/app/tutorial.tsx` |

Main libraries in `src/lib/`:

- `targets.ts`, `water.ts`, `coach-api.ts`: daily targets, water and the AI coach (all numbers come from the server).
- `nutrition-coach.ts`: the plain advice on the Today screen ("about 800 kcal short, add a snack").
- `progress.ts`, `progress-core.ts`: Progress & tracking over 7 or 30 days.
- `reminders.ts`, `activity-reminders.ts`: local notifications for meals, workouts, water, weigh-ins, a missed-workout nudge, coach reminders and quiet hours. They are rebuilt every time the app opens, because iOS keeps at most 64 scheduled notifications.
- `secure-storage.ts`: the sign-in token in the phone's encrypted storage (browser storage on web).

## How the coach works

- **Targets** are calculated on the server in plain code (`server/src/lib/targets.ts`: Mifflin-St Jeor BMR, activity level, a safe weekly rate), never by the AI. Under-18s, underweight users and very low calorie levels get safe limits.
- **The AI coach** (`server/src/ai/coach.ts`) uses Gemini function calling. It reads the user's real profile, targets, intake, pantry, water, workouts and weight through tools, so it does not invent numbers.
- **Food the coach or a photo estimates** is only a draft. Nothing is logged until the user taps **Log it**. Logged food can be undone in Food history.
- **Weekly check-in**: once a week the server compares the weight trend with the plan and changes calories by 150 to 200 kcal if the user is off track. The change and its reason appear on the Today screen.
- AI requests (chat, meal suggestions, food estimates) count toward the monthly limit shown in Profile.

All advice is general guidance, not medical advice.

## Checks

```bash
npx tsc --noEmit
npx expo lint
```

The logic in `src/lib` that has no React imports is unit tested from the server: run `npm test` in `../server`.
