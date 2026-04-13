import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow, TAB_COLORS } from '../theme';
import { ShoppingListStorage, TaskStorage, EventStorage, BudgetStorage } from '../storage';

const GREETING = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
};

const isWeb = Platform.OS === 'web';

export default function HomeScreen({ navigation }) {
  const [stats, setStats] = useState({ lists: 0, items: 0, tasks: 0, spent: 0 });
  const [todayEvents, setTodayEvents] = useState([]);
  const [pendingTasks, setPendingTasks] = useState([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const now = new Date();
    const [lists, allItems, tasks, expenses] = await Promise.all([
      ShoppingListStorage.getLists(),
      ShoppingListStorage.getAllItems(),
      TaskStorage.getAll(),
      BudgetStorage.getForMonth(now.getFullYear(), now.getMonth()),
    ]);
    const events = await EventStorage.getAll();
    const todayStr = now.toDateString();
    setTodayEvents(events.filter(e => new Date(e.date).toDateString() === todayStr).slice(0, 3));
    setPendingTasks(tasks.filter(t => !t.done).slice(0, 5));
    setStats({
      lists: lists.length,
      items: allItems.filter(i => !i.checked).length,
      tasks: tasks.filter(t => !t.done).length,
      spent: expenses.filter(e => e.type === 'expense').reduce((s, e) => s + e.amount, 0),
    });
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const todayStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const year = new Date().getFullYear();

  const NAV_ITEMS = [
    { label: 'Shopping', icon: '🛒', color: TAB_COLORS.shopping, bg: '#E8FAF7', tab: 'ShoppingTab', stat: stats.lists, statLabel: `${stats.lists} list${stats.lists !== 1 ? 's' : ''}` },
    { label: 'Tasks', icon: '✅', color: TAB_COLORS.tasks, bg: '#FFF0F0', tab: 'TasksTab', stat: stats.tasks, statLabel: `${stats.tasks} pending` },
    { label: 'Calendar', icon: '📅', color: TAB_COLORS.calendar, bg: '#E3F2FD', tab: 'CalendarTab', stat: todayEvents.length, statLabel: `${todayEvents.length} today` },
    { label: 'Budget', icon: '💳', color: TAB_COLORS.budget, bg: '#FFF4E0', tab: 'BudgetTab', stat: `$${stats.spent.toFixed(0)}`, statLabel: 'this month' },
  ];

  const priorityColor = { high: Colors.coral, medium: Colors.amber, low: Colors.mint };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, isWeb && styles.contentWeb]}
      showsVerticalScrollIndicator={false}
      refreshControl={!isWeb ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} /> : undefined}
    >
      {/* Hero banner */}
      <View style={[styles.hero, isWeb && styles.heroWeb]}>
        <View style={styles.heroLeft}>
          <Text style={styles.heroGreeting}>{GREETING()} 👋</Text>
          <Text style={styles.heroDate}>{todayStr}</Text>
          <Text style={styles.heroSub}>Here's your household overview</Text>
        </View>
        {isWeb && (
          <View style={styles.heroRight}>
            <Text style={styles.heroYear}>{year}</Text>
          </View>
        )}
      </View>

      {/* Nav cards grid */}
      <View style={[styles.navGrid, isWeb && styles.navGridWeb]}>
        {NAV_ITEMS.map(item => (
          <TouchableOpacity
            key={item.tab}
            style={[styles.navCard, isWeb && styles.navCardWeb, { borderTopColor: item.color, borderTopWidth: 3 }]}
            onPress={() => navigation.navigate(item.tab)}
            activeOpacity={0.75}
          >
            <View style={[styles.navCardIcon, { backgroundColor: item.bg }]}>
              <Text style={{ fontSize: isWeb ? 28 : 24 }}>{item.icon}</Text>
            </View>
            <View style={styles.navCardBody}>
              <Text style={styles.navCardStat}>{item.stat}</Text>
              <Text style={styles.navCardLabel}>{item.label}</Text>
              <Text style={styles.navCardMeta}>{item.statLabel}</Text>
            </View>
            <Text style={[styles.navCardArrow, { color: item.color }]}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {isWeb ? (
        <View style={styles.webColumns}>
          {/* Today's events */}
          <View style={styles.webCol}>
            <Text style={styles.sectionTitle}>TODAY'S EVENTS</Text>
            {todayEvents.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyBoxText}>No events scheduled for today</Text>
              </View>
            ) : todayEvents.map(e => (
              <View key={e.id} style={styles.webEventRow}>
                <View style={[styles.webEventDot, { backgroundColor: e.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.webEventTitle}>{e.title}</Text>
                  {e.time ? <Text style={styles.webEventTime}>{e.time}</Text> : null}
                </View>
              </View>
            ))}
          </View>

          {/* Pending tasks */}
          <View style={styles.webCol}>
            <Text style={styles.sectionTitle}>PENDING TASKS</Text>
            {pendingTasks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyBoxText}>All tasks completed 🎉</Text>
              </View>
            ) : pendingTasks.map(t => (
              <TouchableOpacity key={t.id} style={styles.webTaskRow} onPress={() => navigation.navigate('TasksTab')}>
                <View style={[styles.webTaskDot, { backgroundColor: priorityColor[t.priority] || Colors.primary }]} />
                <Text style={styles.webTaskTitle} numberOfLines={1}>{t.title}</Text>
                {t.dueDate && (
                  <Text style={styles.webTaskDue}>
                    {new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </Text>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : (
        <>
          {todayEvents.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>TODAY'S EVENTS</Text>
              <View style={styles.card}>
                {todayEvents.map((e, i) => (
                  <View key={e.id} style={[styles.eventRow, i < todayEvents.length - 1 && styles.rowBorder]}>
                    <View style={[styles.dot, { backgroundColor: e.color }]} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{e.title}</Text>
                      {e.time ? <Text style={styles.rowMeta}>{e.time}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}

          {pendingTasks.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>PENDING TASKS</Text>
              <View style={styles.card}>
                {pendingTasks.map((t, i) => (
                  <TouchableOpacity key={t.id} style={[styles.eventRow, i < pendingTasks.length - 1 && styles.rowBorder]} onPress={() => navigation.navigate('TasksTab')}>
                    <View style={[styles.dot, { backgroundColor: priorityColor[t.priority] || Colors.primary }]} />
                    <Text style={[styles.rowTitle, { flex: 1 }]} numberOfLines={1}>{t.title}</Text>
                    {t.dueDate && <Text style={styles.rowMeta}>{new Date(t.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </>
      )}

      <View style={{ height: 100 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.md },
  contentWeb: { paddingHorizontal: 40, maxWidth: 1100, alignSelf: 'center', width: '100%' },
  hero: { paddingTop: Spacing.xl, paddingBottom: Spacing.lg },
  heroWeb: { paddingTop: 48, paddingBottom: 32, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  heroLeft: {},
  heroRight: {},
  heroGreeting: { fontSize: isWeb ? 40 : Fonts.sizes.xxxl, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -1 },
  heroDate: { fontSize: Fonts.sizes.md, color: Colors.primary, fontWeight: '600', marginTop: 4 },
  heroSub: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, marginTop: 2 },
  heroYear: { fontSize: 80, fontWeight: '800', color: Colors.border, letterSpacing: -4 },
  navGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  navGridWeb: { gap: 16, marginBottom: 32 },
  navCard: {
    flex: 1, minWidth: '45%',
    backgroundColor: Colors.bgCard, borderRadius: Radius.lg,
    padding: Spacing.md, borderWidth: 1, borderColor: Colors.border,
    flexDirection: 'row', alignItems: 'center', gap: 12, ...Shadow.sm,
  },
  navCardWeb: {
    minWidth: '22%', padding: 20, borderRadius: 16,
    flexDirection: 'column', alignItems: 'flex-start', gap: 12,
    cursor: 'pointer',
  },
  navCardIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  navCardBody: { flex: 1 },
  navCardStat: { fontSize: Fonts.sizes.xl, fontWeight: '800', color: Colors.textPrimary, letterSpacing: -0.5 },
  navCardLabel: { fontSize: Fonts.sizes.sm, fontWeight: '700', color: Colors.textPrimary, marginTop: 1 },
  navCardMeta: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 1 },
  navCardArrow: { fontSize: 22, fontWeight: '600' },
  webColumns: { flexDirection: 'row', gap: 24, marginTop: 8 },
  webCol: { flex: 1, backgroundColor: Colors.bgCard, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: Colors.border, ...Shadow.sm },
  webEventRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  webEventDot: { width: 10, height: 10, borderRadius: 5 },
  webEventTitle: { fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  webEventTime: { fontSize: 12, color: Colors.textSecondary, marginTop: 2 },
  webTaskRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  webTaskDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  webTaskTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.textPrimary },
  webTaskDue: { fontSize: 12, color: Colors.textSecondary, backgroundColor: Colors.bgElevated, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  emptyBox: { paddingVertical: 24, alignItems: 'center' },
  emptyBoxText: { fontSize: 14, color: Colors.textMuted },
  sectionTitle: { fontSize: Fonts.sizes.xs, fontWeight: '700', color: Colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, marginTop: 8 },
  card: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, overflow: 'hidden', ...Shadow.sm },
  eventRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, gap: 10 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.border },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  rowTitle: { fontSize: Fonts.sizes.sm, fontWeight: '600', color: Colors.textPrimary },
  rowMeta: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
});
