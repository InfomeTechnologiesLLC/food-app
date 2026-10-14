export interface TrainingPreferences {
  enabled: boolean; goal: 'general_fitness' | 'strength' | 'muscle_gain' | 'endurance'; experience: 'beginner' | 'intermediate';
  equipment: ('dumbbells' | 'bench' | 'cable_machine' | 'stationary_bike')[]; weekdays: number[]; sessionMinutes: number; excludedExercises: string[];
}
export interface ExerciseDefinition { id: string; name: string; category: 'squat' | 'hinge' | 'push' | 'pull' | 'core' | 'cardio'; equipment: string[]; tracking: 'reps' | 'duration'; instructions: string[] }
export interface Prescription { exerciseId: string; sets: number; repsMin: number | null; repsMax: number | null; durationSeconds: number | null; restSeconds: number }
export interface WorkoutDay { date: string; title: string; explanation: string; exercises: Prescription[] }
export interface WorkoutPlan { _id: string; __v: number; title: string; status: 'draft' | 'active' | 'archived'; days: WorkoutDay[]; context: { training: TrainingPreferences; startDate: string; timezone: string } }
export interface SetLog { reps: number | null; weightKg: number | null; durationSeconds: number | null; distanceKm: number | null; status: 'pending' | 'completed' | 'skipped' }
export interface SessionExercise { exerciseId: string; definition: ExerciseDefinition; restSeconds: number; sets: SetLog[] }
export interface WorkoutSession { _id: string; revision: number; planId: string | null; scheduledDate: string | null; date: string; timezone: string; title: string; startedAt: string; finishedAt: string | null; status: 'in_progress' | 'finished' | 'discarded'; notes: string; feedback: 'easy' | 'right' | 'hard' | null; exercises: SessionExercise[] }
export interface LocalSession { session: WorkoutSession; pending: boolean; operationId: string; error: string | null; conflict: WorkoutSession | null; delivery?: { operationId: string; session: WorkoutSession } }
export const DEFAULT_TRAINING: TrainingPreferences = { enabled: false, goal: 'general_fitness', experience: 'beginner', equipment: [], weekdays: [1, 3, 5], sessionMinutes: 30, excludedExercises: [] };
