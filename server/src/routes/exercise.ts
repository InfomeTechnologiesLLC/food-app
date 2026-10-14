import { Router } from 'express';
import mongoose, { isValidObjectId } from 'mongoose';
import { z } from 'zod';
import { requireAuth, type AuthRequest } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { WorkoutPlan, WorkoutSession } from '../models/Workout.js';
import { EXERCISES, exerciseById, trainingSchema, validateWorkout, workoutOutputSchema, sessionPayloadSchema, type WorkoutContext } from '../domain/exercise.js';
import { calendarToday, dateSchema, timezoneSchema } from '../lib/calendar.js';
import { generateWorkout } from '../ai/exercise.js';
import { AIError } from '../ai/gemini.js';
const router = Router();
router.use(requireAuth);
router.get('/library', (_req, res) => res.json(EXERCISES));
router.get('/plans', async (req: AuthRequest, res) => res.json(await WorkoutPlan.find({ userId: req.userId }).sort({ createdAt: -1 }).limit(30).lean()));
router.post('/plans', async (req: AuthRequest, res) => {
  const body = z.object({ timezone: timezoneSchema, startDate: dateSchema }).strict().safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: 'Choose a valid start date and timezone' });
  if (body.data.startDate < calendarToday(body.data.timezone)) return res.status(400).json({ error: 'Start date cannot be in the past' });
  const user = await User.findById(req.userId).lean();
  if (!user) return res.status(401).json({ error: 'Account not found' });
  const prefs = trainingSchema.safeParse(user.training);
  if (!prefs.success || !prefs.data.enabled) return res.status(400).json({ error: 'Set up exercise preferences first' });
  const sessions = await WorkoutSession.find({ userId: req.userId, status: 'finished' }).sort({ startedAt: -1 }).limit(10).lean();
  const context: WorkoutContext = { ...body.data, training: prefs.data, body: user.body ?? {}, recentSessions: sessions.map(({ date, feedback, exercises, notes }) => ({ date, feedback, exercises, notes })) };
  try {
    const generated = await generateWorkout(context);
    const plan = await WorkoutPlan.create({ userId: req.userId, ...generated, context });
    res.status(201).json(plan);
  } catch (err) { if (err instanceof AIError) return res.status(err.status).json({ error: err.message }); throw err; }
});
router.patch('/plans/:id', async (req: AuthRequest, res) => {
  const body = workoutOutputSchema.extend({ revision: z.number().int().nonnegative() }).strict().safeParse(req.body);
  if (!body.success || !isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid workout plan' });
  const plan = await WorkoutPlan.findOne({ _id: req.params.id as string, userId: req.userId });
  if (!plan) return res.status(404).json({ error: 'Plan not found' });
  const errors = validateWorkout(body.data, plan.context as WorkoutContext);
  if (errors.length) return res.status(400).json({ error: errors.join('; ') });
  const updated = await WorkoutPlan.findOneAndUpdate({ _id: plan._id, userId: req.userId, __v: body.data.revision, status: { $ne: 'archived' } },
    { $set: { title: body.data.title, days: body.data.days }, $inc: { __v: 1 } }, { returnDocument: 'after', runValidators: true });
  if (!updated) return res.status(409).json({ error: 'Plan changed. Refresh before editing.' });
  res.json(updated);
});
router.post('/plans/:id/activate', async (req: AuthRequest, res) => {
  const body = z.object({ revision: z.number().int(), activeId: z.string().nullable(), activeRevision: z.number().int().nullable() }).strict().safeParse(req.body);
  if (!body.success || !isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid activation request' });
  let conflict = false;
  const result = await mongoose.connection.transaction(async session => {
    await User.updateOne({ _id: req.userId }, { $inc: { scheduleRevision: 1 } }, { session });
    const plan = await WorkoutPlan.findOne({ _id: req.params.id as string, userId: req.userId }).session(session);
    const active = await WorkoutPlan.findOne({ userId: req.userId, status: 'active' }).session(session);
    if (plan?.status === 'active') return plan;
    if (!plan || plan.status !== 'draft' || plan.__v !== body.data.revision || (active ? String(active._id) : null) !== body.data.activeId || (active?.__v ?? null) !== body.data.activeRevision) { conflict = true; return null; }
    if (active) await WorkoutPlan.deleteOne({ _id: active._id, userId: req.userId }, { session });
    plan.status = 'active'; await plan.save({ session }); return plan;
  });
  if (conflict) return res.status(409).json({ error: 'Your schedule changed. Refresh before activating.' });
  res.json(result);
});
router.delete('/plans/:id', async (req: AuthRequest, res) => {
  if (!isValidObjectId(req.params.id)) return res.status(400).json({ error: 'Invalid plan ID' });
  await mongoose.connection.transaction(async session => {
    await User.updateOne({ _id: req.userId }, { $inc: { scheduleRevision: 1 } }, { session });
    await WorkoutPlan.deleteOne({ _id: req.params.id as string, userId: req.userId }, { session });
  });
  res.status(204).end();
});
router.get('/sessions', async (req: AuthRequest, res) => {
  const query = z.object({ date: dateSchema.optional(), cursor: z.string().uuid().optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).safeParse(req.query);
  if (!query.success) return res.status(400).json({ error: 'Invalid history query' });
  const filter: mongoose.QueryFilter<mongoose.InferSchemaType<typeof WorkoutSession.schema>> = { userId: req.userId, status: { $ne: 'discarded' }, ...(query.data.date ? { date: query.data.date } : {}) };
  let before = {};
  if (query.data.cursor) {
    const cursor = await WorkoutSession.findOne({ _id: query.data.cursor, userId: req.userId }).lean();
    if (!cursor) return res.status(400).json({ error: 'Invalid history cursor' });
    before = { $or: [{ date: { $lt: cursor.date } }, { date: cursor.date, _id: { $lt: cursor._id } }] };
  }
  const entries = await WorkoutSession.find({ ...filter, ...before }).sort({ date: -1, _id: -1 }).limit(query.data.limit + 1).lean();
  const hasMore = entries.length > query.data.limit;
  if (hasMore) entries.pop();
  res.json({ entries, nextCursor: hasMore ? entries.at(-1)!._id : null });
});
router.put('/sessions/:id', async (req: AuthRequest, res) => {
  const body = z.object({ baseRevision: z.number().int().min(0), operationId: z.string().uuid(), session: sessionPayloadSchema }).strict().safeParse(req.body);
  if (!body.success || !z.string().uuid().safeParse(req.params.id).success) return res.status(400).json({ error: body.success ? 'Invalid session ID' : body.error.issues[0].message });
  const { baseRevision, operationId, session: payload } = body.data;
  if (payload.date !== calendarToday(payload.timezone, new Date(payload.startedAt)) || payload.date > calendarToday(payload.timezone) || new Date(payload.startedAt).getTime() > Date.now() + 60000 || (payload.finishedAt && new Date(payload.finishedAt).getTime() > Date.now() + 60000)) return res.status(400).json({ error: 'Session date must match its start time and cannot be in the future' });
  const previous = await WorkoutSession.findOne({ _id: req.params.id as string, userId: req.userId }).lean();
  if (previous?.operationId === operationId) return res.json(previous);
  if ((previous?.revision ?? 0) !== baseRevision) return res.status(409).json({ error: 'This workout changed on another device', code: 'SESSION_CONFLICT', server: previous });
  const data = { ...payload, exercises: payload.exercises.map(e => ({ ...e, definition: previous?.exercises.find(x => x.exerciseId === e.exerciseId)?.definition ?? exerciseById(e.exerciseId) })) };
  if (!previous) {
    try { return res.status(201).json(await WorkoutSession.create({ _id: req.params.id as string, userId: req.userId, ...data, revision: 1, operationId })); }
    catch (err) { if ((err as { code?: number }).code !== 11000) throw err; }
  } else {
    const updated = await WorkoutSession.findOneAndUpdate({ _id: req.params.id as string, userId: req.userId, revision: baseRevision }, { $set: { ...data, operationId }, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true });
    if (updated) return res.json(updated);
  }
  const server = await WorkoutSession.findOne({ _id: req.params.id as string, userId: req.userId }).lean();
  if (server?.operationId === operationId) return res.json(server);
  res.status(409).json({ error: 'This workout changed. Choose which version to keep.', code: 'SESSION_CONFLICT', server });
});
export default router;
