import { test } from "node:test";
import assert from "node:assert/strict";
import { dayAdvice, nutrientRows, type DayInput, type Macros } from "../../mobile/src/lib/nutrition-coach.js";
import { planActivityReminders, waterExpectedMl, type ActivityState } from "../../mobile/src/lib/activity-reminders.js";
import { parseProfile } from "../../mobile/src/lib/measurements.js";

const m = (calories: number, proteinGrams: number, carbsGrams = 0, fatGrams = 0): Macros => ({ calories, proteinGrams, carbsGrams, fatGrams });
const targets = { ...m(2500, 120, 300, 70), direction: "lose" as const };
const day = (over: Partial<DayInput>): DayInput => ({ eaten: m(0, 0), targets, plannedLeft: m(0, 0), mealsLeft: 0, hour: 13, ...over });

// ── daily advice ──

test("nothing eaten: morning start vs. nothing logged later", () => {
  assert.equal(dayAdvice(day({ hour: 8 })).title, "A fresh start");
  const later = dayAdvice(day({ hour: 14 }));
  assert.equal(later.title, "Nothing logged yet today");
  assert.match(later.detail, /2500 kcal and 120 g protein/);
});

test("over calories warns when losing, is relaxed when gaining", () => {
  const over = dayAdvice(day({ eaten: m(2900, 120) }));
  assert.deepEqual([over.tone, over.title], ["warn", "Over today’s calories"]);
  assert.match(over.detail, /400 kcal over/);
  assert.equal(dayAdvice(day({ eaten: m(2900, 120), targets: { ...targets, direction: "gain" } })).tone, "info");
});

test("on target: praise, unless protein is short", () => {
  assert.deepEqual(dayAdvice(day({ eaten: m(2450, 115) })).tone, "good");
  const short = dayAdvice(day({ eaten: m(2450, 70) }));
  assert.equal(short.title, "Calories done, protein short");
  assert.match(short.detail, /50 g protein/);
});

test("mid-day: compares the remaining planned meals with what is still needed", () => {
  const covered = dayAdvice(day({ eaten: m(800, 40), plannedLeft: m(1650, 80), mealsLeft: 2 }));
  assert.match(covered.detail, /About 1700 kcal and 80 g protein left today\. Your 2 remaining planned meals cover this\./);
  const short = dayAdvice(day({ eaten: m(800, 40), plannedLeft: m(900, 40), mealsLeft: 1 }));
  assert.match(short.detail, /leaves you about 800 kcal short, so add a snack/);
  const over = dayAdvice(day({ eaten: m(800, 40), plannedLeft: m(2200, 80), mealsLeft: 2 }));
  assert.match(over.detail, /about 500 kcal over, so have smaller portions/);
});

test("protein lagging behind calories is called out", () => {
  assert.match(dayAdvice(day({ eaten: m(1500, 30) })).detail, /Protein is falling behind/);
});

test("late evening with too little eaten and nothing planned", () => {
  const a = dayAdvice(day({ eaten: m(1200, 60), hour: 21 }));
  assert.equal(a.title, "Finish the day well");
  assert.match(a.detail, /costs muscle/);
});

test("nutrient rows show eaten, target, left and percent", () => {
  const [cal, protein] = nutrientRows(m(1250.4, 130), m(2500, 120));
  assert.deepEqual(cal, { key: "calories", label: "Calories", unit: "kcal", eaten: 1250, target: 2500, left: 1250, percent: 50 });
  assert.equal(protein!.left, -10);
});

// ── water reminders ──

const base = (water: Partial<NonNullable<ActivityState["water"]>> = {}, now = new Date(2026, 9, 28, 10, 30)): ActivityState => ({
  now, today: "2026-10-28",
  meals: { enabled: false, hour: 19, planDates: [], eatenToday: 0, plannedToday: 0 },
  workout: { enabled: false, hour: 18, plannedDates: [], doneToday: false },
  weighIn: { enabled: false, hour: 8, daysSinceLast: 0 },
  water: { enabled: true, startHour: 8, endHour: 20, intervalHours: 2, goalMl: 2400, drankToday: 1000, ...water },
});

test("water expected by a time spreads the goal over the window", () => {
  assert.equal(waterExpectedMl(2400, new Date(2026, 9, 28, 7), 8, 20), 0);
  assert.equal(waterExpectedMl(2400, new Date(2026, 9, 28, 14), 8, 20), 1200);
  assert.equal(waterExpectedMl(2400, new Date(2026, 9, 28, 22), 8, 20), 2400);
});

test("water reminders: rest of today and all of tomorrow, every 2 hours", () => {
  const r = planActivityReminders(base());
  const hours = (date: number) => r.filter((x) => x.date.getDate() === date).map((x) => x.date.getHours());
  assert.deepEqual(hours(28), [12, 14, 16, 18, 20]);
  assert.deepEqual(hours(29), [8, 10, 12, 14, 16, 18, 20]);
  assert.ok(r.every((x) => x.kind === "water-reminder" && x.url === "/"));
  assert.equal(r.find((x) => x.date.getDate() === 29)!.title, "Good morning");
});

test("today's reminders say when the user is behind", () => {
  const r = planActivityReminders(base({ drankToday: 600 }));
  const at = (h: number) => r.find((x) => x.date.getDate() === 28 && x.date.getHours() === h)!;
  assert.equal(at(12).title, "Time for some water"); // 800 ml expected by 12:00, 600 drunk: less than a glass behind
  assert.equal(at(14).title, "You are behind on water");
  assert.match(at(14).body, /0.6 L of 2.4 L so far/); // 1200 ml expected by 14:00
});

test("no more water reminders today once the goal is reached, or when switched off", () => {
  const done = planActivityReminders(base({ drankToday: 2400 }));
  assert.ok(done.every((x) => x.date.getDate() === 29));
  assert.equal(planActivityReminders(base({ enabled: false })).length, 0);
  assert.equal(planActivityReminders(base({ intervalHours: 3 })).filter((x) => x.date.getDate() === 29).length, 5); // 8, 11, 14, 17, 20
});

test("water reminders stay well under the iOS limit of 64 even with everything on", () => {
  const all = planActivityReminders({
    ...base({ startHour: 6, endHour: 22, drankToday: 0 }, new Date(2026, 9, 28, 0, 30)),
    meals: { enabled: true, hour: 19, planDates: Array.from({ length: 7 }, (_, i) => `2026-10-${28 + i > 31 ? "0" + (28 + i - 31) : 28 + i}`), eatenToday: 0, plannedToday: 3 },
    weighIn: { enabled: true, hour: 8, daysSinceLast: null },
  });
  assert.ok(all.length <= 64 - 20, `${all.length} activity reminders + 20 expiry reminders must fit in 64`);
});

// ── profile parsing ──

test("parseProfile validates birth year and timeframe; blanks clear them", () => {
  assert.deepEqual(parseProfile({ sex: "female", birthYear: "1995", activityLevel: "light", goalWeeks: "20" }, 2026),
    { sex: "female", birthYear: 1995, activityLevel: "light", goalWeeks: 20 });
  assert.deepEqual(parseProfile({ sex: null, birthYear: " ", activityLevel: null, goalWeeks: "" }, 2026),
    { sex: null, birthYear: null, activityLevel: null, goalWeeks: null });
  assert.throws(() => parseProfile({ sex: null, birthYear: "2020", activityLevel: null, goalWeeks: "" }, 2026), /Birth year/);
  assert.throws(() => parseProfile({ sex: null, birthYear: "95", activityLevel: null, goalWeeks: "" }, 2026), /Birth year/);
  assert.throws(() => parseProfile({ sex: null, birthYear: "", activityLevel: null, goalWeeks: "0" }, 2026), /Timeframe/);
  assert.throws(() => parseProfile({ sex: null, birthYear: "", activityLevel: null, goalWeeks: "4.5" }, 2026), /Timeframe/);
});
