import { useAuth } from '@/lib/auth';
import { buildCoach } from '@/lib/coach';
import { useProgress } from '@/lib/progress';
import { useWeights, weightSeries } from '@/lib/weight';

/** The coaching summary for the last 7 days, built from the progress and weigh-in data the app already loads. */
export function useCoach() {
  const { user } = useAuth();
  const progress = useProgress(7);
  const weights = useWeights();
  const series = weightSeries(weights.data, user?.body.weightKg, user?.body.weightUpdatedAt);

  const { food, exercise, today } = progress;
  const todayFood = food.days[0];
  const todayWorkout = exercise.days[0];
  const lastWorkoutIndex = exercise.days.findIndex((d) => d.sessions.length > 0);

  const coach = user ? buildCoach({
    goal: user.preferences.goal,
    heightCm: user.body.heightCm, weightKg: user.body.weightKg, targetWeightKg: user.body.targetWeightKg,
    weights: series, today,
    food: { hasPlan: food.hasPlan, rate: { percent: food.summary.percent, planned: food.summary.planned, done: food.summary.done }, todayDone: todayFood?.done ?? 0, todayPlanned: todayFood?.planned ?? 0 },
    exercise: {
      enabled: exercise.enabled, hasPlan: exercise.hasPlan,
      rate: { percent: exercise.summary.percent, planned: exercise.summary.planned, done: exercise.summary.done },
      todayPlanned: (todayWorkout?.planned ?? 0) > 0, todayDone: (todayWorkout?.done ?? 0) > 0,
      daysSinceLast: lastWorkoutIndex === -1 ? null : lastWorkoutIndex,
      missed: exercise.days.filter((d) => d.status === 'missed' || d.status === 'partial').length,
    },
  }) : null;

  return { coach, series, loading: progress.loading || weights.isLoading, progress };
}
