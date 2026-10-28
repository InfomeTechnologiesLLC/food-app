# MealMind database (MySQL)

The server stores everything in **MySQL**. It uses
[Drizzle ORM](https://orm.drizzle.team) with the `mysql2` driver.

- The tables are defined in one file, `src/db/schema.ts`.
- The SQL that creates them is in `drizzle/0000_init.sql`. You can read it, but you don't need to run it by hand.
- Each area of the app has one file in `src/repos/` (users, pantry, meal plans, history, workouts, scans, admin). All reads and writes go through these files.

Tested with MySQL 8.0. It should also work on MariaDB 10.5+ (the "MySQL" that ships with XAMPP), but that hasn't been tested.

## First-time setup (phpMyAdmin)

1. Open phpMyAdmin and click **New**. Create a database named `mealmind` with collation **`utf8mb4_unicode_ci`**. Leave it empty.
2. In `server/.env`, set the connection:
   ```
   DATABASE_URL=mysql://root:YOUR_PASSWORD@localhost:3306/mealmind
   ```
   - XAMPP's default root user has no password, so use `mysql://root@localhost:3306/mealmind`.
   - If your password has characters like `@ # / :`, use the separate `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` and `DB_NAME` settings instead (see `.env.example`).
3. From `server/`, run:
   ```sh
   npm install
   npm run dev
   ```
   The first start creates all the tables. Refresh phpMyAdmin and you'll see them. Restarting is safe: a table that already exists is never created twice.
4. Optional: `npm run seed:admin` creates the admin portal login, and `NODE_ENV=development npm run seed:kerala -- --user you@example.com` fills an account with sample data.

If the server says it **could not connect to MySQL**, check three things: MySQL is running (XAMPP control panel), the `mealmind` database exists, and the user and password in `.env` are right.

## The tables

Each MongoDB collection is now a table. Each list that used to be nested inside a document is now its own **child table**. A child table points to its parent with a foreign key that uses `ON DELETE CASCADE`, so deleting a parent row also deletes its children.

| Area | Table | One row is… | Belongs to |
|---|---|---|---|
| Accounts | `users` | an app user, including preferences, body, training settings and monthly usage | — |
| | `admin_accounts` | an admin portal login | — |
| | `admin_sessions` | a signed-in admin (expires after 8 h) | `admin_accounts` |
| Pantry | `pantry_ingredients` | one ingredient a user has, such as "rice" (unique per user) | `users` |
| | `pantry_batches` | one purchase of it, with its own quantity, unit and expiry | `pantry_ingredients` |
| | `stock_operations` | a receipt for one "add stock" action, so a retried request never adds stock twice | `users` |
| | `stock_operation_items` | the items in that receipt | `stock_operations` |
| | `scans` | a groceries or receipt photo scan, with the raw AI output | `users` |
| Meals | `meal_plans` | a user's accepted plan, plus a copy of their settings (only one per user) | `users` |
| | `meal_plan_days` | one day of the plan | `meal_plans` |
| | `meals` | breakfast, lunch, dinner or a snack, with nutrition and the eaten flag | `meal_plan_days` |
| | `meal_ingredients` | one ingredient line of a meal | `meals` |
| | `food_history` | a meal the user ate, with a copy of the meal that is kept even if the plan is deleted | `users` |
| | `food_history_consumed` | what eating it took from the pantry, so **undo** can put it back | `food_history` |
| Exercise | `workout_plans` | a weekly workout plan (draft or active; only one active per user) | `users` |
| | `workout_plan_days` | one day of the plan | `workout_plans` |
| | `workout_plan_exercises` | one prescribed exercise (sets, reps, rest) | `workout_plan_days` |
| | `workout_sessions` | a logged workout (its id is a UUID made by the phone) | `users` |
| | `workout_session_exercises` | one exercise in that workout | `workout_sessions` |
| | `workout_session_sets` | one set (reps, weight, duration, status) | `workout_session_exercises` |
| Progress | `weight_logs` | one weigh-in per user per day | `users` |
| | `planned_days` | what was planned on a past day (number of meals, or 1 for a training day), saved when the meal or workout plan that covered it is replaced or deleted, so progress tracking keeps counting it | `users` |

`__drizzle_migrations` is bookkeeping. It records which schema changes have already been applied, so leave it alone.

### A few design notes

- **IDs** are 24-character strings such as `6ad99908e369af21c9e87214`, the same format MongoDB used. Phones that already store IDs keep working, and new IDs still sort by creation time. Child rows that the app never refers to directly (ingredient lines, sets, …) use plain auto-increment numbers.
- **JSON columns** hold short lists of plain values, such as `allergies` (`["milk","eggs"]`), cooking `steps`, training `weekdays`, the exercise `definition` snapshot and the raw AI scan output. The app always reads and writes these lists as a whole and never searches inside them, so separate tables would only add work. Any list of real records has its own table.
- **"Only one" rules are enforced by MySQL itself** through unique indexes: one pantry row per ingredient per user, one active meal plan, one active workout plan, and one un-undone history entry per meal. The `active_flag` and `live_flag` columns are filled in automatically to make those indexes work. You never set them.
- **Times are stored in UTC.** `expiry_date`, `created_at` and similar columns are UTC. Calendar days (a plan's `date`, `start_date`) are `DATE` columns with no time zone.
- **Concurrency:** writes that change one user's stock, plans or history run in a transaction that first locks that user's row in `users`. Two taps from the same user therefore run one after the other, and a meal can't be eaten twice or undone twice.

## Changing the database later

1. Edit `src/db/schema.ts` (for example, add a column).
2. Run `npm run db:generate`. This writes a new numbered `.sql` file in `drizzle/`, which you can review.
3. Restart the server, or run `npm run db:migrate`, to apply it.

Commit the files in `drizzle/` together with the schema change. To manage migrations yourself instead of on startup, set `DB_AUTO_MIGRATE=false`.

`npm run db:studio` opens Drizzle Studio, a browser view of the data, as an alternative to phpMyAdmin.

## Tests

- `npm test` runs the unit tests. They don't need a database.
- `npm run test:integration` creates a temporary database next to the one in `DATABASE_URL`, builds the tables, runs the tests and drops it afterwards. The MySQL user therefore needs permission to create and drop databases (root does).
