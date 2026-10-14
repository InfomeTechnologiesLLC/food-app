import { Schema, model } from 'mongoose';
const prescription = new Schema({ exerciseId: { type: String, required: true }, sets: Number, repsMin: Number, repsMax: Number, durationSeconds: Number, restSeconds: Number }, { _id: false });
const day = new Schema({ date: { type: String, required: true }, title: String, explanation: String, exercises: [prescription] }, { _id: false });
const plan = new Schema({ userId: { type: Schema.Types.ObjectId, required: true, index: true }, title: String, status: { type: String, enum: ['draft', 'active'], default: 'draft' },
  days: [day], context: { type: Schema.Types.Mixed, required: true } }, { timestamps: true, optimisticConcurrency: true });
plan.index({ userId: 1, status: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
export const WorkoutPlan = model('WorkoutPlan', plan);
const set = new Schema({ reps: Number, weightKg: Number, durationSeconds: Number, distanceKm: Number, status: String }, { _id: false });
const session = new Schema({ _id: { type: String, required: true }, userId: { type: Schema.Types.ObjectId, required: true, index: true }, revision: { type: Number, required: true }, operationId: { type: String, required: true },
  planId: { type: String, default: null }, scheduledDate: { type: String, default: null }, date: { type: String, required: true }, timezone: String, title: String,
  startedAt: String, finishedAt: { type: String, default: null }, status: { type: String, enum: ['in_progress', 'finished'] }, notes: String, feedback: { type: String, default: null },
  exercises: [{ _id: false, exerciseId: String, restSeconds: Number, definition: { type: Schema.Types.Mixed, required: true }, sets: [set] }],
}, { timestamps: true });
session.index({ userId: 1, date: -1, _id: -1 });
export const WorkoutSession = model('WorkoutSession', session);
