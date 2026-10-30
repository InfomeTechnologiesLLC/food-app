import { z } from 'zod';
import { addDays, dateSchema, timezoneSchema } from '../lib/calendar.js';

export const EQUIPMENT = ['dumbbells', 'bench', 'cable_machine', 'stationary_bike'] as const;
export const trainingSchema = z.object({
  enabled: z.boolean(),
  goal: z.enum(['general_fitness', 'strength', 'muscle_gain', 'endurance']),
  experience: z.enum(['beginner', 'intermediate']),
  equipment: z.array(z.enum(EQUIPMENT)).max(4).refine(v => new Set(v).size === v.length),
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(4).refine(v => new Set(v).size === v.length),
  sessionMinutes: z.number().int().min(15).max(60),
  excludedExercises: z.array(z.string().max(60)).max(40),
}).strict();
export type TrainingPreferences = z.infer<typeof trainingSchema>;
export const DEFAULT_TRAINING: TrainingPreferences = { enabled: false, goal: 'general_fitness', experience: 'beginner', equipment: [], weekdays: [1, 3, 5], sessionMinutes: 30, excludedExercises: [] };
export interface ExerciseDefinition {
  id: string; name: string; category: 'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'cardio';
  equipment: string[]; tracking: 'reps' | 'duration'; instructions: string[];
}
// Authored library. No third-party exercise media or instructions are copied.
export const EXERCISES: ExerciseDefinition[] = [
  { id: 'chair-squat', name: 'Chair squat', category: 'squat', equipment: [], tracking: 'reps', instructions: ['Use a stable chair against a wall.', 'Stand in front of it, bend hips and knees, and lower slowly.', 'Touch the seat gently and stand up. Keep movement comfortable.'] },
  { id: 'bodyweight-squat', name: 'Bodyweight squat', category: 'squat', equipment: [], tracking: 'reps', instructions: ['Stand with feet comfortably apart.', 'Bend hips and knees within a comfortable range.', 'Stand back up with control.'] },
  { id: 'glute-bridge', name: 'Glute bridge', category: 'hinge', equipment: [], tracking: 'reps', instructions: ['Lie on your back with knees bent and feet on the floor.', 'Lift hips without arching your lower back.', 'Lower slowly.'] },
  { id: 'wall-pushup', name: 'Wall push-up', category: 'push', equipment: [], tracking: 'reps', instructions: ['Place hands on a wall at chest height.', 'Keep your body straight and bend elbows to approach the wall.', 'Push back to the starting position.'] },
  { id: 'knee-pushup', name: 'Knee push-up', category: 'push', equipment: [], tracking: 'reps', instructions: ['Support yourself on hands and knees.', 'Keep a straight line from knees to shoulders.', 'Lower your chest with control and push up.'] },
  { id: 'bird-dog', name: 'Bird dog', category: 'core', equipment: [], tracking: 'reps', instructions: ['Start on hands and knees.', 'Extend one arm and the opposite leg without twisting.', 'Return and alternate. Count each side as one rep.'] },
  { id: 'dead-bug', name: 'Dead bug', category: 'core', equipment: [], tracking: 'reps', instructions: ['Lie on your back with arms up and knees bent.', 'Slowly extend one arm and the opposite leg while keeping your back comfortable.', 'Return and alternate. Count each side as one rep.'] },
  { id: 'plank', name: 'Forearm plank', category: 'core', equipment: [], tracking: 'duration', instructions: ['Support yourself on forearms and toes, or knees for an easier version.', 'Keep hips aligned with shoulders.', 'Breathe normally and stop when you cannot maintain position.'] },
  { id: 'walk', name: 'Walking', category: 'cardio', equipment: [], tracking: 'duration', instructions: ['Choose a safe, comfortable route.', 'Walk at a pace you can sustain.', 'Ease into and out of your walk.'] },
  { id: 'march', name: 'March in place', category: 'cardio', equipment: [], tracking: 'duration', instructions: ['Stand near a stable support if needed.', 'Alternate lifting feet at a comfortable pace.', 'Keep breathing steadily.'] },
  { id: 'goblet-squat', name: 'Dumbbell goblet squat', category: 'squat', equipment: ['dumbbells'], tracking: 'reps', instructions: ['Hold a comfortable dumbbell close to your chest.', 'Bend hips and knees within your comfortable range.', 'Stand back up with control.'] },
  { id: 'dumbbell-rdl', name: 'Dumbbell Romanian deadlift', category: 'hinge', equipment: ['dumbbells'], tracking: 'reps', instructions: ['Hold dumbbells by your sides with knees slightly bent.', 'Move hips back, keeping the weights close and your back comfortable.', 'Stand by bringing hips forward.'] },
  { id: 'dumbbell-floor-press', name: 'Dumbbell floor press', category: 'push', equipment: ['dumbbells'], tracking: 'reps', instructions: ['Lie on the floor holding comfortable dumbbells above your chest.', 'Lower until upper arms gently touch the floor.', 'Press up with control.'] },
  { id: 'dumbbell-row', name: 'Dumbbell bent-over row', category: 'pull', equipment: ['dumbbells'], tracking: 'reps', instructions: ['Hold dumbbells and hinge forward comfortably.', 'Draw elbows back without jerking or twisting.', 'Lower slowly.'] },
  { id: 'bench-press', name: 'Dumbbell bench press', category: 'push', equipment: ['dumbbells', 'bench'], tracking: 'reps', instructions: ['Lie on a stable bench with feet supported.', 'Lower comfortable dumbbells toward the sides of your chest.', 'Press up with control.'] },
  { id: 'cable-row', name: 'Seated cable row', category: 'pull', equipment: ['cable_machine'], tracking: 'reps', instructions: ['Adjust the seat and choose a comfortable load.', 'Sit upright and draw the handle toward your torso.', 'Return with control without rocking your body.'] },
  { id: 'bike', name: 'Stationary cycling', category: 'cardio', equipment: ['stationary_bike'], tracking: 'duration', instructions: ['Adjust the seat to a comfortable position.', 'Pedal with light resistance to start.', 'Keep a sustainable pace and ease down before stopping.'] },
];
export const exerciseById = (id: string) => EXERCISES.find(e => e.id === id);
export const availableExercises = (prefs: TrainingPreferences) => EXERCISES.filter(e => !prefs.excludedExercises.includes(e.id) && e.equipment.every(x => prefs.equipment.includes(x as typeof EQUIPMENT[number])));
export const prescriptionSchema = z.object({
  exerciseId: z.string().min(1), sets: z.number().int().min(1).max(3),
  repsMin: z.number().int().min(1).max(20).nullable(), repsMax: z.number().int().min(1).max(20).nullable(),
  durationSeconds: z.number().int().min(10).max(3600).nullable(), restSeconds: z.number().int().min(30).max(180),
}).strict();
export const workoutDaySchema = z.object({ date: dateSchema, title: z.string().min(1).max(100), explanation: z.string().min(1).max(600), exercises: z.array(prescriptionSchema).max(8) }).strict();
export const workoutOutputSchema = z.object({ title: z.string().min(1).max(100), days: z.array(workoutDaySchema).length(7) }).strict();
export type WorkoutOutput = z.infer<typeof workoutOutputSchema>;
export interface WorkoutContext {
  startDate: string; timezone: string; training: TrainingPreferences; body: { heightCm?: number | null; weightKg?: number | null }; recentSessions: unknown[];
  /** The user's body goal from the target engine, so the week supports it (lose fat, build muscle, keep steady) */
  bodyGoal?: { direction: 'lose' | 'gain' | 'maintain'; nutritionGoal: string; weeklyRateKg: number | null } | null;
}
export function validateWorkout(plan: WorkoutOutput, input: WorkoutContext): string[] {
  const errors: string[] = [];
  const allowed = new Set(availableExercises(input.training).map(e => e.id));
  plan.days.forEach((day, i) => {
    const expected = addDays(input.startDate, i);
    if (day.date !== expected) errors.push(`Day ${i + 1} must be ${expected}`);
    const scheduled = input.training.weekdays.includes(new Date(`${expected}T00:00:00Z`).getUTCDay());
    if (scheduled !== (day.exercises.length > 0)) errors.push(`${expected}: respect training weekdays and rest days`);
    if (new Set(day.exercises.map(e => e.exerciseId)).size !== day.exercises.length) errors.push(`${expected}: duplicate exercise`);
    let seconds = day.exercises.length ? 300 : 0; // Reserve five minutes for preparation/warm-up.
    let totalSets = 0;
    for (const p of day.exercises) {
      const e = exerciseById(p.exerciseId);
      if (!e || !allowed.has(p.exerciseId)) { errors.push(`Unavailable exercise ${p.exerciseId}`); continue; }
      if (e.tracking === 'reps' && (p.repsMin === null || p.repsMax === null || p.repsMin > p.repsMax || p.durationSeconds !== null)) errors.push(`${e.id}: use a valid rep range only`);
      if (e.tracking === 'duration' && (p.durationSeconds === null || p.repsMin !== null || p.repsMax !== null)) errors.push(`${e.id}: use duration only`);
      if (e.category === 'core' && e.tracking === 'duration' && (p.durationSeconds ?? 0) > 60) errors.push(`${e.id}: holds must be at most 60 seconds`);
      totalSets += p.sets;
      seconds += p.sets * (p.durationSeconds ?? (p.repsMax ?? 0) * 4) + Math.max(0, p.sets - 1) * p.restSeconds + 60;
    }
    if (totalSets > 18) errors.push(`${expected}: maximum 18 prescribed sets`);
    if (seconds > input.training.sessionMinutes * 60) errors.push(`${expected}: exceeds session duration including preparation and transitions`);
  });
  return errors;
}
export const setLogSchema = z.object({ reps: z.number().int().min(1).max(200).nullable(), weightKg: z.number().min(0).max(500).nullable(), durationSeconds: z.number().int().min(1).max(86400).nullable(), distanceKm: z.number().min(0).max(1000).nullable(), status: z.enum(['pending', 'completed', 'skipped']) }).strict();
export const sessionPayloadSchema = z.object({
  planId: z.string().nullable(), scheduledDate: dateSchema.nullable(), date: dateSchema, timezone: timezoneSchema,
  title: z.string().min(1).max(100), startedAt: z.iso.datetime(), finishedAt: z.iso.datetime().nullable(),
  status: z.enum(['in_progress', 'finished']), notes: z.string().max(2000), feedback: z.enum(['easy', 'right', 'hard']).nullable(),
  exercises: z.array(z.object({ exerciseId: z.string(), restSeconds: z.number().int().min(30).max(180), sets: z.array(setLogSchema).min(1).max(10) }).strict()).min(1).max(20),
}).strict().superRefine((s, ctx) => {
  if ((s.status === 'in_progress') !== (s.finishedAt === null)) ctx.addIssue({ code: 'custom', message: 'Finished sessions need an end time' });
  if (s.finishedAt && s.finishedAt < s.startedAt) ctx.addIssue({ code: 'custom', message: 'End time precedes start' });
  if (s.planId && !/^[a-f\d]{24}$/i.test(s.planId)) ctx.addIssue({ code: 'custom', message: 'Invalid plan ID' });
  for (const item of s.exercises) {
    const e = exerciseById(item.exerciseId);
    if (!e) { ctx.addIssue({ code: 'custom', message: 'Unknown exercise' }); continue; }
    for (const set of item.sets) {
      if (e.tracking === 'reps' && (set.durationSeconds !== null || set.distanceKm !== null || (set.status === 'completed' && set.reps === null))) ctx.addIssue({ code: 'custom', message: 'Strength sets need reps, not duration/distance' });
      if (e.tracking === 'duration' && (set.reps !== null || set.weightKg !== null || (set.status === 'completed' && set.durationSeconds === null))) ctx.addIssue({ code: 'custom', message: 'Timed sets need duration, not reps/weight' });
      if (e.category !== 'cardio' && set.distanceKm !== null) ctx.addIssue({ code: 'custom', message: 'Distance is for cardio only' });
    }
  }
});
