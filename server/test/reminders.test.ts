import { test } from "node:test";
import assert from "node:assert/strict";
import { planActivityReminders, MISSED_NUDGE_HOUR, type ActivityState } from "../../mobile/src/lib/activity-reminders.js";

const state = (over: Partial<ActivityState> = {}, now = new Date(2026, 9, 28, 7, 0)): ActivityState => ({
  now, today: "2026-10-28",
  meals: { enabled: false, hour: 19, planDates: [], eatenToday: 0, plannedToday: 0 },
  workout: { enabled: true, hour: 18, plannedDates: [], doneToday: false, missedYesterday: true },
  weighIn: { enabled: false, hour: 8, daysSinceLast: 0 },
  ...over,
});
const nudges = (s: ActivityState) => planActivityReminders(s).filter((r) => r.kind === "missed-workout");

test("missed workout: one nudge this morning, worded for whether today is planned", () => {
  const [n] = nudges(state());
  assert.equal(n!.date.getHours(), MISSED_NUDGE_HOUR);
  assert.match(n!.body, /short walk/);
  assert.match(nudges(state({ workout: { enabled: true, hour: 18, plannedDates: ["2026-10-28"], doneToday: false, missedYesterday: true } }))[0]!.body, /Today’s session is planned/);
});

test("missed workout: no nudge when not missed, already trained today, past 9 am, or exercise is off", () => {
  assert.equal(nudges(state({ workout: { enabled: true, hour: 18, plannedDates: [], doneToday: false, missedYesterday: false } })).length, 0);
  assert.equal(nudges(state({ workout: { enabled: true, hour: 18, plannedDates: [], doneToday: true, missedYesterday: true } })).length, 0);
  assert.equal(nudges(state({}, new Date(2026, 9, 28, 10, 0))).length, 0);
  assert.equal(nudges(state({ workout: { enabled: false, hour: 18, plannedDates: [], doneToday: false, missedYesterday: true } })).length, 0);
});

test("quiet hours silence reminders, including across midnight", () => {
  const water = { enabled: true, startHour: 6, endHour: 22, intervalHours: 2, goalMl: 2000, drankToday: 0 };
  const hours = (quiet: ActivityState["quiet"]) => planActivityReminders(state({ water, quiet }, new Date(2026, 9, 28, 0, 30)))
    .filter((r) => r.kind === "water-reminder" && r.date.getDate() === 28).map((r) => r.date.getHours());
  assert.deepEqual(hours(undefined), [6, 8, 10, 12, 14, 16, 18, 20, 22]);
  assert.deepEqual(hours({ enabled: true, start: 22, end: 7 }), [8, 10, 12, 14, 16, 18, 20]);
  assert.deepEqual(hours({ enabled: true, start: 12, end: 15 }), [6, 8, 10, 16, 18, 20, 22]);
  assert.deepEqual(hours({ enabled: false, start: 22, end: 7 }), [6, 8, 10, 12, 14, 16, 18, 20, 22]);
});

test("period reminder fires two days before the expected start, once, and not when it has passed", () => {
  const period = (nextStart: string | null) => planActivityReminders(state({ workout: { enabled: false, hour: 18, plannedDates: [], doneToday: false, missedYesterday: false }, period: { nextStart } }))
    .filter((r) => r.kind === "period-reminder");
  const soon = period("2026-11-02");
  assert.equal(soon.length, 1);
  assert.equal(soon[0]!.date.getTime(), new Date(2026, 9, 31, 9, 0).getTime());
  assert.deepEqual(period("2026-10-29"), [], "two days before is already in the past");
  assert.deepEqual(period(null), []);
});
