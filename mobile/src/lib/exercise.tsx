import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { randomUUID } from 'expo-crypto';
import * as Network from 'expo-network';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from './auth';
import { api, ApiError } from './api';
import { readLocal, writeLocal } from './local-store';
import { acknowledgeSession, reconcileSessions, sessionPayload } from './workout-sync';
import { prescribedExercises, archiveWorkoutDay } from './workout-tracking';
import { localDate, timezone } from './plans';
import type { ExerciseDefinition, LocalSession, WorkoutDay, WorkoutPlan, WorkoutSession } from './exercise-types';
interface ExerciseContextValue {
  sessions: LocalSession[]; sync: () => Promise<void>; syncing: boolean;
  start: (day: WorkoutDay, library: ExerciseDefinition[], planId: string | null, initialize?: (session: WorkoutSession) => WorkoutSession) => string;
  importSession: (session: WorkoutSession) => void;
  save: (session: WorkoutSession) => void; resolve: (id: string, choice: 'local' | 'server') => void;
}
const Context = createContext<ExerciseContextValue | null>(null);
export function ExerciseProvider({ children }: { children: ReactNode }) {
  const { user, needsSignIn } = useAuth();
  const account = user?._id ?? '';
  const currentAccount = useRef(account); currentAccount.current = account;
  const canSync = useRef(!needsSignIn); canSync.current = !needsSignIn;
  const qc = useQueryClient();
  const [sessionState, setSessionState] = useState<{ account: string; rows: LocalSession[] }>({ account: '', rows: [] });
  const sessions = sessionState.account === account ? sessionState.rows : [];
  const [syncing, setSyncing] = useState(false);
  const locks = useRef(new Set<string>());
  const records = useCallback(() => readLocal<LocalSession[]>(account, 'sessions') ?? [], [account]);
  const commit = useCallback((rows: LocalSession[]) => {
    rows = rows.map(row => {
      const session = archiveWorkoutDay(row.session);
      return session === row.session ? row : { ...row, session, pending: true, operationId: randomUUID() };
    });
    writeLocal(account, 'sessions', rows);
    if (currentAccount.current === account) setSessionState({ account, rows });
  }, [account]);
  useEffect(() => { commit(account ? records() : []); }, [account, records, commit]);
  const sync = useCallback(async () => {
    if (!account) return;
    commit(records());
    if (!canSync.current || locks.current.has(account)) return;
    locks.current.add(account); setSyncing(true);
    try {
      for (const initial of records()) {
        if (currentAccount.current !== account || !canSync.current) break;
        if (!initial.pending || initial.conflict) continue;
        const delivery = initial.delivery ?? { operationId: initial.operationId, session: initial.session };
        commit(records().map(r => r.session._id === initial.session._id ? { ...r, delivery } : r));
        try {
          const server = await api<WorkoutSession>(`/exercise/sessions/${initial.session._id}`, { method: 'PUT', timeoutMs: 15000, body: {
            operationId: delivery.operationId, baseRevision: delivery.session.revision, session: sessionPayload(delivery.session),
          } });
          commit(records().map(r => r.session._id === initial.session._id ? acknowledgeSession(r, delivery.operationId, server) : r));
        } catch (error) {
          const err = error as Error;
          commit(records().map(r => r.session._id !== initial.session._id ? r : { ...r, error: err.message,
            delivery: error instanceof ApiError && error.status === 400 ? undefined : r.delivery,
            conflict: error instanceof ApiError && error.status === 409 ? error.data?.server ?? null : r.conflict,
          }));
          if (!(error instanceof ApiError) || error.status === 401) break;
        }
      }
      if (currentAccount.current === account && canSync.current) {
        const server: WorkoutSession[] = [];
        let cursor: string | null = null;
        do {
          const page: { entries: WorkoutSession[]; nextCursor: string | null } = await api(`/exercise/sessions?${new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) })}`, { timeoutMs: 15000 });
          server.push(...page.entries);
          cursor = page.nextCursor;
        } while (cursor && currentAccount.current === account && canSync.current);
        if (currentAccount.current !== account || !canSync.current) return;
        commit(reconcileSessions(records(), server, randomUUID));
        qc.invalidateQueries({ queryKey: ['exercise', account] });
      }
    } catch { /* Offline: keep local sessions and queued writes. */ }
    finally { locks.current.delete(account); if (currentAccount.current === account) setSyncing(false); }
  }, [account, records, commit, qc]);
  useEffect(() => {
    if (!account) return;
    void sync();
    const app = AppState.addEventListener('change', s => { if (s === 'active') void sync(); });
    const network = Network.addNetworkStateListener(s => { if (s.isConnected && s.isInternetReachable !== false) void sync(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void sync(); }, 15000);
    return () => { app.remove(); network.remove(); clearInterval(timer); };
  }, [account, needsSignIn, sync]);
  const save = (session: WorkoutSession) => {
    if (archiveWorkoutDay(session).status === 'finished') { commit(records()); return; }
    const rows = records();
    const old = rows.find(r => r.session._id === session._id);
    const next: LocalSession = { ...old, session: { ...session, revision: old?.session.revision ?? session.revision }, pending: true, operationId: randomUUID(), error: null, conflict: old?.conflict ?? null };
    commit([...rows.filter(r => r.session._id !== session._id), next]);
  };
  const start = (day: WorkoutDay, library: ExerciseDefinition[], planId: string | null, initialize?: (session: WorkoutSession) => WorkoutSession) => {
    commit(records());
    const active = records().find(r => r.session.status === 'in_progress');
    if (active) return active.session._id;
    if (!account || !day.exercises.length) throw new Error('Choose a workout first.');
    const session: WorkoutSession = { _id: randomUUID(), revision: 0, planId, scheduledDate: planId ? day.date : null, date: localDate(), timezone: timezone(),
      title: day.title, startedAt: new Date().toISOString(), finishedAt: null, status: 'in_progress', notes: '', feedback: null,
      exercises: prescribedExercises(day, library),
    };
    save(initialize ? initialize(session) : session); return session._id;
  };
  const importSession = (session: WorkoutSession) => {
    const rows = records();
    if (!rows.some(r => r.session._id === session._id)) commit([...rows, { session, pending: false, operationId: randomUUID(), error: null, conflict: null }]);
  };
  const resolve = (id: string, choice: 'local' | 'server') => {
    commit(records().map(r => {
      if (r.session._id !== id || !r.conflict) return r;
      return { session: choice === 'server' ? r.conflict : { ...r.session, revision: r.conflict.revision }, pending: choice === 'local', operationId: randomUUID(), conflict: null, error: null };
    }));
    void sync();
  };
  return <Context.Provider value={{ sessions: account ? sessions : [], start, save, importSession, sync, syncing, resolve }}>{children}</Context.Provider>;
}
export function useExercise() { const value = useContext(Context); if (!value) throw new Error('ExerciseProvider is missing'); return value; }
export function useExerciseLibrary() {
  const { user } = useAuth(); const id = user?._id ?? '';
  return useQuery({ queryKey: ['exercise', id, 'library'], enabled: !!id, initialData: () => readLocal<ExerciseDefinition[]>(id, 'library') ?? undefined,
    queryFn: async () => { const data = await api<ExerciseDefinition[]>('/exercise/library'); writeLocal(id, 'library', data); return data; } });
}
export function useWorkoutPlans() {
  const { user } = useAuth(); const id = user?._id ?? '';
  return useQuery({ queryKey: ['exercise', id, 'plans'], enabled: !!id, initialData: () => readLocal<WorkoutPlan[]>(id, 'plans') ?? undefined,
    queryFn: async () => { const data = await api<WorkoutPlan[]>('/exercise/plans'); writeLocal(id, 'plans', data); return data; } });
}
