import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router, type Href } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { LogFoodSheet } from '@/components/log-food-sheet';
import { MealSuggestionCard } from '@/components/meal-suggestion-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Button } from '@/components/ui';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadChat, saveChat, useCoachChat, useNextMeal } from '@/lib/coach-api';
import { useKeyboardLift } from '@/lib/keyboard';
import { dateLabel } from '@/lib/plans';
import { scheduleCoachReminder } from '@/lib/reminders';
import type { CoachAction, CoachMessage, CoachScreen as AppScreen, FoodEstimate, MealType } from '@/lib/types';

/** Starters across everything the coach helps with, not only food */
const PROMPTS = [
  'How am I doing today?', 'What’s my workout today?', 'I drank 2 glasses of water', 'How was my week?',
  'Can I skip today’s workout?', 'What in my pantry expires soon?', 'I ate 2 parathas and a tea', 'Remind me to drink water at 4 pm',
];
/** One-tap questions above the chat */
const QUICK: { label: string; icon: React.ComponentProps<typeof Ionicons>['name']; text?: string }[] = [
  { label: 'Meal idea', icon: 'restaurant-outline' },
  { label: 'Workout', icon: 'barbell-outline', text: 'What’s my workout today?' },
  { label: 'Log food', icon: 'add-circle-outline' },
  { label: 'Progress', icon: 'trending-up-outline', text: 'How is my progress this week?' },
];
const SCREENS: Record<AppScreen, Href> = {
  today: '/', meals: '/plans', exercise: '/exercise', workout_history: '/workout-history', pantry: '/pantry', progress: '/progress', profile: '/settings',
};
const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const formatTime = (time: string) => { const [h, m] = time.split(':').map(Number); return `${h! % 12 || 12}:${String(m).padStart(2, '0')} ${h! < 12 ? 'AM' : 'PM'}`; };

/** Chat with the AI coach. Its answers use your real targets, meals, pantry, water and workouts. */
export default function CoachScreen() {
  const theme = useTheme();
  const { user, refreshUser } = useAuth();
  const qc = useQueryClient();
  const chat = useCoachChat();
  const nextMeal = useNextMeal();
  const scroll = useRef<ScrollView>(null);
  // The message box sits on top of the keyboard instead of under it
  const column = useRef<View>(null);
  const keyboard = useKeyboardLift(column);
  const [messages, setMessages] = useState<CoachMessage[]>(() => (user ? loadChat(user._id) : []));
  const [confirm, setConfirm] = useState<{ estimate: FoodEstimate; mealType: MealType } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [reminderNotes, setReminderNotes] = useState<Record<string, string>>({});
  const busy = chat.isPending || nextMeal.isPending;

  useEffect(() => { if (user) saveChat(user._id, messages); }, [user, messages]);
  // Keep the newest message in view; an empty chat stays at the top so the quick buttons show
  useEffect(() => { if (messages.length || busy) setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50); }, [messages.length, busy, keyboard.lift]);

  /** Side effects of coach actions: set phone reminders, refresh targets after a check-in. */
  const handleActions = async (messageId: string, actions: CoachAction[]) => {
    for (const [i, a] of actions.entries()) {
      if (a.type === 'reminder') {
        const ok = await scheduleCoachReminder(a.date, a.time, a.body).catch(() => false);
        setReminderNotes((n) => ({ ...n, [`${messageId}-${i}`]: ok ? `Reminder set for ${dateLabel(a.date)}, ${formatTime(a.time)}` : 'Couldn’t set the reminder. Allow notifications for MealMind, or it may be in the past.' }));
      }
      if (a.type === 'check_in') { void qc.invalidateQueries({ queryKey: ['targets'] }); void qc.invalidateQueries({ queryKey: ['target-changes'] }); }
      // The coach saved water or a weigh-in: show it everywhere at once
      if (a.type === 'logged') {
        void qc.invalidateQueries({ queryKey: ['coach-today'] });
        void qc.invalidateQueries({ queryKey: [a.kind === 'water' ? 'water' : 'weights'] });
        if (a.kind === 'weight') void refreshUser();
      }
    }
  };

  const send = (raw: string) => {
    const value = raw.trim();
    if (!value || busy) return;
    const history = [...messages, { id: newId(), role: 'user' as const, text: value }];
    setMessages(history);
    chat.mutate(history, {
      onSuccess: (res) => {
        const id = newId();
        setMessages((m) => [...m, { id, role: 'coach', text: res.reply, actions: res.actions }]);
        void handleActions(id, res.actions);
      },
      onError: (e) => setMessages((m) => [...m, { id: newId(), role: 'coach', text: e.message, error: true }]),
    });
  };

  const suggest = () => {
    if (busy) return;
    setMessages((m) => [...m, { id: newId(), role: 'user', text: 'What should I eat next?' }]);
    nextMeal.mutate(undefined, {
      onSuccess: (result) => setMessages((m) => [...m, { id: newId(), role: 'coach', text: result.status === 'suggested' ? 'Here is an idea that fits what you have left today.' : result.message, actions: result.status === 'suggested' ? [{ type: 'meal_suggestion', result }] : [] }]),
      onError: (e) => setMessages((m) => [...m, { id: newId(), role: 'coach', text: e.message, error: true }]),
    });
  };

  // Stable, so messages that didn't change are not redrawn
  const confirmFood = useCallback((estimate: FoodEstimate, mealType: MealType) => setConfirm({ estimate, mealType }), []);
  const limitReached = [chat.error, nextMeal.error].some((e) => e instanceof ApiError && e.code === 'LIMIT_REACHED');

  return (
    <ThemedView style={{ flex: 1 }}>
      <View ref={column} style={{ flex: 1, paddingBottom: keyboard.lift }}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.actions}>
            {QUICK.map((q, i) => (
              <Pressable key={q.label} accessibilityRole="button" disabled={busy && q.label !== 'Log food'}
                onPress={() => (q.text ? send(q.text) : q.label === 'Log food' ? setLogOpen(true) : suggest())}
                style={({ pressed }) => [styles.quick, { backgroundColor: i === 0 ? theme.tint : theme.backgroundElement, opacity: pressed || (busy && q.label !== 'Log food') ? 0.6 : 1 }]}>
                <Ionicons name={q.icon} size={20} color={i === 0 ? theme.tintText : theme.tint} />
                <ThemedText type="smallBold" numberOfLines={1} style={{ fontSize: 12, color: i === 0 ? theme.tintText : theme.text }}>{q.label}</ThemedText>
              </Pressable>
            ))}
          </View>

          {messages.length === 0 && (
            <View style={[styles.intro, { backgroundColor: theme.backgroundElement }]}>
              <Ionicons name="chatbubbles-outline" size={28} color={theme.tint} />
              <ThemedText style={{ fontWeight: 700 }}>Hi! I’m your MealMind coach.</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                I coach your whole day: meals, workouts, water, weight and progress, your pantry{user?.period?.tracking ? ', your cycle' : ''}, sleep and motivation. Tell me what you ate or drank, ask what to do next, or ask how your week went. I use your real data.
              </ThemedText>
            </View>
          )}

          {messages.map((m) => (
            <MessageRow key={m.id} message={m} notes={m.actions?.map((_, i) => reminderNotes[`${m.id}-${i}`] ?? '').join('|') ?? ''} onConfirm={confirmFood} />
          ))}
          {busy && <ActivityIndicator color={theme.tint} style={{ alignSelf: 'flex-start' }} />}
          {limitReached && <Button title="See plans" variant="secondary" onPress={() => router.push('/upgrade')} />}

          {messages.length < 2 && (
            <View style={styles.chips}>
              {PROMPTS.map((p) => (
                <Pressable key={p} onPress={() => send(p)} style={[styles.chip, { borderColor: theme.border }]} accessibilityRole="button">
                  <ThemedText type="small">{p}</ThemedText>
                </Pressable>
              ))}
            </View>
          )}
          <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12, textAlign: 'center' }}>
            General guidance, not medical advice.{messages.length ? '  ' : ''}
            {messages.length > 0 && <ThemedText type="small" themeColor="tint" style={{ fontSize: 12 }} onPress={() => setMessages([])}>Clear chat</ThemedText>}
          </ThemedText>
        </ScrollView>

        <ChatInput busy={busy} onSend={send} />
      </View>

      <LogFoodSheet visible={logOpen || !!confirm} initial={confirm ?? undefined} onClose={() => { setLogOpen(false); setConfirm(null); }} />
    </ThemedView>
  );
}

/** The message box keeps its own text, so typing redraws only the box and not the whole chat. */
function ChatInput({ busy, onSend }: { busy: boolean; onSend: (text: string) => void }) {
  const theme = useTheme();
  const [text, setText] = useState('');
  const submit = () => { if (!text.trim() || busy) return; onSend(text); setText(''); };
  return (
    <View style={[styles.inputBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="Message your coach"
        placeholderTextColor={theme.textSecondary}
        value={text}
        onChangeText={setText}
        onSubmitEditing={submit}
        returnKeyType="send"
        // Long messages wrap onto more lines, so all of the text stays visible while typing
        multiline
        submitBehavior="submit"
        // One line to start with on the web, where text areas default to two
        numberOfLines={Platform.OS === 'web' ? 1 : undefined}
        maxLength={1000}
        accessibilityLabel="Message your coach"
      />
      <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim() || busy} onPress={submit}
        style={[styles.send, { backgroundColor: theme.tint, opacity: !text.trim() || busy ? 0.5 : 1 }]}>
        <Ionicons name="arrow-up" size={20} color={theme.tintText} />
      </Pressable>
    </View>
  );
}

/** One message and its cards. Memoised: only new or changed messages are drawn again. `notes` joins the reminder notes. */
const MessageRow = memo(function MessageRow({ message: m, notes, onConfirm }: { message: CoachMessage; notes: string; onConfirm: (e: FoodEstimate, t: MealType) => void }) {
  const theme = useTheme();
  const noteList = notes.split('|');
  return (
    <View style={{ gap: Spacing.two, alignItems: m.role === 'user' ? 'flex-end' : 'stretch' }}>
      <View style={[styles.bubble, m.role === 'user'
        ? { backgroundColor: theme.tint, alignSelf: 'flex-end' }
        : { backgroundColor: theme.backgroundElement, alignSelf: 'flex-start' }]}>
        <ThemedText style={{ color: m.role === 'user' ? theme.tintText : m.error ? theme.danger : theme.text }}>{m.text}</ThemedText>
      </View>
      {m.actions?.map((a, i) => (
        <ActionView key={i} action={a} note={noteList[i] || undefined} onConfirm={onConfirm} />
      ))}
    </View>
  );
});

function ActionView({ action, note, onConfirm }: { action: CoachAction; note?: string; onConfirm: (e: FoodEstimate, t: MealType) => void }) {
  const theme = useTheme();
  if (action.type === 'meal_suggestion') return <MealSuggestionCard result={action.result} />;
  if (action.type === 'confirm_food') {
    const e = action.estimate;
    return (
      <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
        <ThemedText style={{ fontWeight: 700 }}>{e.title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">About {e.totals.calories} kcal · {e.totals.proteinGrams} g protein (estimate)</ThemedText>
        <Button title="Check and log it" icon="checkmark-outline" variant="secondary" onPress={() => onConfirm(e, action.mealType)} />
      </View>
    );
  }
  if (action.type === 'logged') {
    return (
      <View style={styles.note}>
        <Ionicons name={action.kind === 'water' ? 'water-outline' : 'scale-outline'} size={16} color={theme.tint} />
        <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>{action.text}</ThemedText>
      </View>
    );
  }
  if (action.type === 'open') {
    return <Button title={action.label} icon="arrow-forward-outline" variant="secondary" onPress={() => router.push(SCREENS[action.screen] ?? '/')} />;
  }
  if (action.type === 'reminder') {
    return (
      <View style={styles.note}>
        <Ionicons name="alarm-outline" size={16} color={theme.tint} />
        <ThemedText type="small" themeColor="textSecondary">{note ?? 'Setting a reminder…'}</ThemedText>
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundSelected }]}>
      <ThemedText type="smallBold">Weekly check-in{action.deltaKcal ? `: ${action.deltaKcal > 0 ? '+' : ''}${action.deltaKcal} kcal a day` : ''}</ThemedText>
      <ThemedText type="small">{action.reason}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center', flexGrow: 1 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  quick: { flex: 1, minHeight: 64, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 4 },
  intro: { borderRadius: 16, padding: Spacing.three, gap: Spacing.one, alignItems: 'flex-start' },
  bubble: { borderRadius: 16, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, maxWidth: '88%' },
  card: { borderRadius: 16, padding: Spacing.three, gap: Spacing.two },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { borderWidth: 1, borderRadius: 999, paddingVertical: 6, paddingHorizontal: Spacing.three },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: Spacing.two, padding: Spacing.two, borderTopWidth: StyleSheet.hairlineWidth, maxWidth: MaxContentWidth, width: '100%', alignSelf: 'center' },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, paddingHorizontal: Spacing.three, paddingTop: 11, paddingBottom: 11, fontSize: 16, lineHeight: 22, textAlignVertical: 'center' },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
