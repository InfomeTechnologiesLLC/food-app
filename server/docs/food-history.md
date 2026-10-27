# Food history development

The server and mobile app use stable meal IDs and local calendar dates. They must
be updated together. There are no migrations or compatibility APIs for mock data.

To explicitly clear development mock data, from `server/` run:

```sh
NODE_ENV=development npm run reset:mock -- --confirm
```

This uses the configured `DATABASE_URL` (MySQL) and deletes plans, food history, pantry,
purchase receipts, and scans. Accounts, preferences, and usage remain intact.
Never point this command at a production database. It refuses other NODE_ENV
values and never runs automatically.

Food history is independent of plans. Undo restores only recorded pantry
amounts, and can recreate an exhausted batch with its original expiry date.
Late logging affects the planned calendar date but deducts today's stock.
Undo does not restore a removed plan. Removing a plan discards uneaten meals.

Run `npm test`, `npm run build`, and `npm run test:integration` in `server/`.
Integration tests create and drop an isolated MySQL test database next to the one in
DATABASE_URL, so that MySQL user needs CREATE/DROP DATABASE rights. Run typecheck and lint in mobile.

## Kerala fixtures

After a mock reset, seed an existing development account directly through the
models (no app API, Gemini calls, or usage deductions):

```sh
NODE_ENV=development npm run seed:kerala -- --user you@example.com --timezone Asia/Kolkata
```

This adds vegetarian Kerala pantry ingredients, a nine-meal active plan covering
yesterday/today/tomorrow, and a two-day replacement draft. History starts empty.
Coconut has two expiry batches; coconut milk and beetroot are deliberately absent
to exercise shopping and shortage confirmation. The fixtures include yogurt.
Repeating the seed for the same account/date does not duplicate stock or plans;
seeding an account with unrelated existing domain data is refused.
