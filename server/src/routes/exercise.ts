import { archiveWorkoutDay } from '../lib/workout-day.js';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { userRepo } from '../repos/users.js';
import { workoutPlanRepo, workoutSessionRepo } from '../repos/workouts.js';
import { isId } from '../db/ids.js';
import { isDuplicateKey, transaction } from '../db/tx.js';
import { EXERCISES, exerciseById, trainingSchema, validateWorkout, workoutOutputSchema, sessionPayloadSchema, type WorkoutContext } from '../domain/exercise.js';
import { calendarToday, dateSchema, timezoneSchema } from '../lib/calendar.js';
import { generateWorkout } from '../ai/exercise.js';
import { AIError } from '../ai/gemini.js';
const router = Router();
router.use(requireAuth);
router.get('/library', (_req, res) => res.json(EXERCISES));
router.get('/plans', async (req: AuthRequest, res) => res.json(await workoutPlanRepo.listForUser(req.userId!, 30)));
router.post('/plans', async (req: AuthRequest, res) => {
  const body = z.object({ timezone: timezoneSchema, startDate: dateSchema }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Choose a valid start date and timezone' });
  if (body.data.startDate < calendarToday(body.data.timezone)) return res.status(400).json({ error: 'Start date cannot be in the past' });
  const user = await userRepo.findById(req.userId!);
  if (!user) return res.status(401).json({ error: 'Account not found' });
  const prefs = trainingSchema.safeParse(user.training);
  if (!prefs.success || !prefs.data.enabled) return res.status(400).json({ error: 'Set up exercise preferences first' });
  const sessions = await workoutSessionRepo.listByStart(req.userId!, 200);
  const context: WorkoutContext = { ...body.data, training: prefs.data, body: user.body ?? {}, recentSessions: sessions.map(s => archiveWorkoutDay(s)).filter(s => s.status === 'finished').slice(0, 10).map(({ date, feedback, exercises, notes }) => ({ date, feedback, exercises, notes })) };
  try {
    const generated = await generateWorkout(context);
    const plan = await workoutPlanRepo.create({ userId: req.userId!, ...generated, context });
    res.status(201).json(plan);
  } catch (err) { if (err instanceof AIError) return res.status(err.status).json({ error: err.message }); throw err; }
});
router.patch('/plans/:id', async (req: AuthRequest, res) => {
  const body = workoutOutputSchema.extend({ revision: z.number().int().nonnegative() }).strict().safeParse(req.body);
  if (!body.success || !isId(req.params.id)) return res.status(400).json({ error: 'Invalid workout plan' });
  const plan = await workoutPlanRepo.findById(req.params.id as string, req.userId!);
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const errors = validateWorkout(body.data, plan.context as WorkoutContext);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const updated = await workoutPlanRepo.updateContent(plan._id, req.userId!, body.data.revision, { title: body.data.title, days: body.data.days });
  if (!updated) return res.status(409).json({ error: 'Plan changed. Refresh before editing.' });
  res.json(updated);
});
router.post('/plans/:id/activate', async (req: AuthRequest, res) => {
  const body = z.object({ revision: z.number().int(), activeId: z.string().nullable(), activeRevision: z.number().int().nullable() }).strict().safeParse(req.body);
  if (!body.success || !isId(req.params.id)) return res.status(400).json({ error: 'Invalid activation request' });
  let conflict = false;
  const result = await transaction(async tx => {
    await userRepo.bumpScheduleRevision(req.userId!, tx);
    const plan = await workoutPlanRepo.findById(req.params.id as string, req.userId!, tx, { lock: true });
    const active = await workoutPlanRepo.findActive(req.userId!, tx, { lock: true });
    if (plan?.status === 'active') return plan;
    if (!plan || plan.status !== 'draft' || plan.__v !== body.data.revision || (active ? active._id : null) !== body.data.activeId || (active?.__v ?? null) !== body.data.activeRevision) { conflict = true; return null; }
    if (active) await workoutPlanRepo.delete(tx, active._id, req.userId!);
    return workoutPlanRepo.activate(tx, plan._id);
  });
  if (conflict) return res.status(409).json({ error: 'Your schedule changed. Refresh before activating.' });
  res.json(result);
});
router.delete('/plans/:id', async (req: AuthRequest, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ error: 'Invalid plan ID' });
  await transaction(async tx => {
    await userRepo.bumpScheduleRevision(req.userId!, tx);
    await workoutPlanRepo.delete(tx, req.params.id as string, req.userId!);
  });
  res.status(204).end();
});
router.get('/sessions', async (req: AuthRequest, res) => {
  const query = z.object({ date: dateSchema.optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid history query' });
  let cursor: { date: string; id: string } | undefined;
  if (query.data.cursor) {
    const found = await workoutSessionRepo.findById(query.data.cursor, req.userId!);
    if (!found) return res.status(400).json({ error: 'Invalid history cursor' });
    cursor = { date: found.date, id: found._id };
  }
  const entries = await workoutSessionRepo.page(req.userId!, { date: query.data.date, cursor, limit: query.data.limit + 1 });
  const hasMore = entries.length > query.data.limit;
  if (hasMore) entries.pop();
  res.json({ entries: entries.map(s => archiveWorkoutDay(s)), nextCursor: hasMore ? entries.at(-1)!._id : null });
});
router.put('/sessions/:id', async (req: AuthRequest, res) => {
  const body = z.object({ baseRevision: z.number().int().min(0), operationId: z.string().uuid(), session: sessionPayloadSchema }).strict().safeParse(req.body);
  if (!body.success || !z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: body.success ? 'Invalid session ID' : body.error.issues[0]!.message });
  const id = req.params.id as string;
  const { baseRevision, operationId, session: payload } = body.data;
  if (payload.date !== calendarToday(payload.timezone, new Date(payload.startedAt)) || payload.date > calendarToday(payload.timezone) || new Date(payload.startedAt).getTime() > Date.now() + 60000 || (payload.finishedAt && new Date(payload.finishedAt).getTime() > Date.now() + 60000)) return res.status(400).json({ error: 'Session date must match its start time and cannot be in the future' });
  const previous = await workoutSessionRepo.findById(id, req.userId!);
  if (previous?.operationId === operationId) return res.json(archiveWorkoutDay(previous));
  if ((previous?.revision ?? 0) !== baseRevision) return res.status(409).json({ error: 'This workout changed on another device', code: 'SESSION_CONFLICT', server: previous ? archiveWorkoutDay(previous) : previous });
  const data = { ...archiveWorkoutDay(payload), exercises: payload.exercises.map(e => ({ ...e, definition: previous?.exercises.find(x => x.exerciseId === e.exerciseId)?.definition ?? exerciseById(e.exerciseId) })) };
  if (!previous) {
    try { return res.status(201).json(await workoutSessionRepo.create({ _id: id, userId: req.userId!, ...data, revision: 1, operationId })); }
    catch (err) { if (!isDuplicateKey(err)) throw err; }
  } else {
    const updated = await workoutSessionRepo.updateIfRevision(id, req.userId!, baseRevision, { ...data, operationId });
    if (updated) return res.json(archiveWorkoutDay(updated));
  }
  const server = await workoutSessionRepo.findById(id, req.userId!);
  if (server?.operationId === operationId) return res.json(archiveWorkoutDay(server));
  res.status(409).json({ error: 'This workout changed. Choose which version to keep.', code: 'SESSION_CONFLICT', server: server ? archiveWorkoutDay(server) : server });
});
export default router;
