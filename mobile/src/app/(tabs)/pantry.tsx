import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { FloatingActions } from '@/components/floating-actions';

import { PantryRow } from '@/components/pantry-row';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Chip, humanize } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { daysUntil, usePantry } from '@/lib/pantry';
import { CATEGORIES, type Category } from '@/lib/types';

export default function PantryScreen() {
  const theme = useTheme();
  const { data: items = [], isLoading, error, refetch, isRefetching } = usePantry();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category | null>(null);

  // Only offer chips for categories the user actually has, in canonical order
  const categories = useMemo(() => CATEGORIES.filter((c) => items.some((i) => i.category === c)), [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter((i) => (!category || i.category === category) && i.name.toLowerCase().includes(q))
      // Soonest-expiring first; undated items sink to the bottom
      .sort((a, b) => (a.expiryDate ? daysUntil(a.expiryDate) : Infinity) - (b.expiryDate ? daysUntil(b.expiryDate) : Infinity));
  }, [items, search, category]);

  return (
    <View style={styles.page}>
    <Screen scroll={false} edges={[]}>
      <FlatList
        data={filtered}
        keyExtractor={(i) => i.key}
        renderItem={({ item }) => <PantryRow item={item} />}
        onRefresh={refetch}
        refreshing={isRefetching}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Spacing.three, gap: Spacing.two }}
        ListHeaderComponent={
          <View style={{ gap: Spacing.three, paddingBottom: Spacing.one }}>
            <View style={styles.topRow}>
              <View style={[styles.search, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Ionicons name="search-outline" size={18} color={theme.textSecondary} />
                <TextInput
                  placeholder="Search your pantry"
                  placeholderTextColor={theme.textSecondary}
                  value={search}
                  onChangeText={setSearch}
                  style={[styles.searchInput, { color: theme.text }]}
                />
              </View>
            </View>

            {categories.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginHorizontal: -Spacing.three }}
                contentContainerStyle={{ gap: Spacing.two, paddingHorizontal: Spacing.three }}>
                <Chip label="All items" selected={!category} onPress={() => setCategory(null)} />
                {categories.map((c) => (
                  <Chip key={c} label={humanize(c)} selected={category === c} onPress={() => setCategory(c)} />
                ))}
              </ScrollView>
            )}

            {items.length > 0 && (
              <View style={styles.listHeader}>
                <ThemedText type="smallBold">Your ingredients</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ fontSize: 12 }}>
                  {filtered.length} {filtered.length === 1 ? 'item' : 'items'}
                </ThemedText>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ActivityIndicator />
          ) : error ? (
            <ThemedText themeColor="danger">Couldn’t load pantry: {(error as Error).message}</ThemedText>
          ) : (
            <ThemedText themeColor="textSecondary">
              {search || category ? 'No matches.' : 'Your pantry is empty. Tap the scan button to scan groceries or a receipt, or + to add an item.'}
            </ThemedText>
          )
        }
      />
    </Screen>
      {/* The two ways to add food: scan groceries or a receipt, or add one item by hand */}
      <FloatingActions>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Scan groceries or receipt"
          onPress={() => router.navigate('/scan')}
          style={({ pressed }) => [styles.scan, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <Ionicons name="scan-outline" size={24} color={theme.tintText} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add item"
          onPress={() => router.push('/pantry-item')}
          style={({ pressed }) => [styles.add, { backgroundColor: theme.tint, opacity: pressed ? 0.7 : 1 }]}>
          <MaterialIcons name="add" size={30} color={theme.tintText} />
        </Pressable>
      </FloatingActions>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.two, height: 50, borderRadius: 14, borderWidth: 1, paddingHorizontal: Spacing.three },
  searchInput: { flex: 1, height: '100%', fontSize: 15 },
  add: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  scan: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Spacing.one },
});
