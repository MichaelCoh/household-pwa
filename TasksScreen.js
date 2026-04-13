import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow, TAB_COLORS } from '../theme';
import { TaskStorage } from '../storage';
import { ScreenHeader, Checkbox, FAB, Input, EmptyState } from '../components/UI';
import { BottomModal } from '../components/BottomModal';
import { CalendarPicker, timeAgo } from '../components/DatePicker';

const PRIORITIES = [
  { key: 'high',   label: 'High',   color: Colors.coral, icon: '🔴' },
  { key: 'medium', label: 'Medium', color: Colors.amber, icon: '🟡' },
  { key: 'low',    label: 'Low',    color: Colors.mint,  icon: '🟢' },
];

const isWeb = Platform.OS === 'web';

function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const p = PRIORITIES.find(x => x.key === task.priority) || PRIORITIES[1];
  const isOverdue = task.dueDate && !task.done && new Date(task.dueDate) < new Date();

  return (
    <View style={[styles.taskItem, task.done && styles.taskItemDone]}>
      <View style={[styles.priorityBar, { backgroundColor: p.color }]} />
      <Checkbox checked={task.done} onPress={() => onToggle(task.id)} color={TAB_COLORS.tasks} />
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={styles.taskMeta}>
          <View style={[styles.pill, { backgroundColor: p.color + '20' }]}>
            <Text style={[styles.pillText, { color: p.color }]}>{p.icon} {p.label}</Text>
          </View>
          {task.dueDate ? (
            <View style={[styles.dueBadge, isOverdue && styles.dueBadgeOverdue]}>
              <Text style={[styles.dueText, isOverdue && { color: Colors.coral, fontWeight: '700' }]}>
                {isOverdue ? '⚠️ ' : '📅 '}
                {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>
        {task.notes ? <Text style={styles.taskNotes} numberOfLines={1}>📝 {task.notes}</Text> : null}
        {/* Created timestamp */}
        <Text style={styles.createdAt}>Created {timeAgo(task.createdAt)}</Text>
      </View>
      <View style={styles.taskActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(task)}>
          <Text style={{ fontSize: 13 }}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(task.id)}>
          <Text style={{ fontSize: 13 }}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function TasksScreen() {
  const [tasks, setTasks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    const all = await TaskStorage.getAll();
    setTasks([...all].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const aOver = a.dueDate && new Date(a.dueDate) < new Date();
      const bOver = b.dueDate && new Date(b.dueDate) < new Date();
      if (aOver !== bOver) return aOver ? -1 : 1;
      return ({ high: 0, medium: 1, low: 2 }[a.priority] || 1) - ({ high: 0, medium: 1, low: 2 }[b.priority] || 1);
    }));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const openAdd = () => {
    setEditingTask(null);
    setTitle(''); setPriority('medium'); setNotes(''); setDueDate('');
    setShowModal(true);
  };

  const openEdit = (task) => {
    setEditingTask(task);
    setTitle(task.title);
    setPriority(task.priority);
    setNotes(task.notes || '');
    setDueDate(task.dueDate || '');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    if (editingTask) {
      await TaskStorage.update(editingTask.id, { title: title.trim(), priority, notes: notes.trim(), dueDate: dueDate || null });
    } else {
      await TaskStorage.add(title.trim(), priority, dueDate || null, notes.trim());
    }
    setShowModal(false);
    load();
  };

  const handleDelete = (id) => Alert.alert('Delete task?', '', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => { await TaskStorage.remove(id); load(); } },
  ]);

  const handleClearDone = () => {
    const n = tasks.filter(t => t.done).length;
    if (!n) return;
    Alert.alert(`Clear ${n} completed task${n > 1 ? 's' : ''}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await TaskStorage.clearDone(); load(); } },
    ]);
  };

  const filtered = filter === 'all' ? tasks : filter === 'done' ? tasks.filter(t => t.done) : tasks.filter(t => !t.done);
  const overdueCount = tasks.filter(t => !t.done && t.dueDate && new Date(t.dueDate) < new Date()).length;
  const doneCount = tasks.filter(t => t.done).length;
  const pendingCount = tasks.filter(t => !t.done).length;

  return (
    <View style={styles.container}>
      <ScreenHeader title="Tasks" subtitle={`${pendingCount} pending · ${doneCount} done`} accent={TAB_COLORS.tasks} />

      <View style={[styles.inner, isWeb && styles.innerWeb]}>
        {overdueCount > 0 && (
          <View style={styles.overdueBar}>
            <Text style={styles.overdueText}>⚠️ {overdueCount} overdue task{overdueCount > 1 ? 's' : ''}</Text>
          </View>
        )}

        <View style={styles.filterRow}>
          {[['pending', `Pending (${pendingCount})`], ['done', `Done (${doneCount})`], ['all', 'All']].map(([k, l]) => (
            <TouchableOpacity key={k}
              style={[styles.filterChip, filter === k && { backgroundColor: TAB_COLORS.tasks + '20', borderColor: TAB_COLORS.tasks }]}
              onPress={() => setFilter(k)}>
              <Text style={[styles.filterText, filter === k && { color: TAB_COLORS.tasks }]}>{l}</Text>
            </TouchableOpacity>
          ))}
          {doneCount > 0 && (
            <TouchableOpacity style={[styles.filterChip, { borderColor: Colors.coral + '50', backgroundColor: Colors.coral + '10' }]} onPress={handleClearDone}>
              <Text style={[styles.filterText, { color: Colors.coral }]}>Clear done</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.length === 0
            ? <EmptyState icon="✅" title="All clear!" subtitle="Tap + to add a task" />
            : filtered.map(t => <TaskItem key={t.id} task={t} onToggle={async id => { await TaskStorage.toggle(id); load(); }} onEdit={openEdit} onDelete={handleDelete} />)
          }
          <View style={{ height: 100 }} />
        </ScrollView>

        {isWeb
          ? <TouchableOpacity style={[styles.webAddBtn, { backgroundColor: TAB_COLORS.tasks }]} onPress={openAdd}>
              <Text style={styles.webAddBtnText}>+ New Task</Text>
            </TouchableOpacity>
          : <FAB onPress={openAdd} color={TAB_COLORS.tasks} />
        }
      </View>

      <BottomModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        title={editingTask ? 'Edit Task' : 'New Task'}
        onSubmit={handleSave}
        submitLabel={editingTask ? 'Save Changes' : 'Create Task'}
        submitColor={TAB_COLORS.tasks}
      >
        <Input label="Task title" placeholder="What needs to be done?" value={title} onChangeText={setTitle} autoFocus multiline />

        <Text style={styles.formLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map(p => (
            <TouchableOpacity key={p.key}
              style={[styles.priorityChip, priority === p.key && { backgroundColor: p.color + '20', borderColor: p.color }]}
              onPress={() => setPriority(p.key)}>
              <Text style={[styles.priorityText, priority === p.key && { color: p.color }]}>{p.icon} {p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.formLabel}>Due date</Text>
        <CalendarPicker value={dueDate} onChange={setDueDate} accentColor={TAB_COLORS.tasks} />

        <Input label="Notes (optional)" placeholder="Add details..." value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
      </BottomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  inner: { flex: 1, paddingHorizontal: Spacing.md },
  innerWeb: { maxWidth: 860, alignSelf: 'center', width: '100%', paddingHorizontal: 40 },
  overdueBar: { backgroundColor: Colors.coral + '15', borderRadius: Radius.sm, padding: Spacing.sm, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: Colors.coral, marginTop: 4 },
  overdueText: { fontSize: Fonts.sizes.sm, color: Colors.coral, fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.sm, flexWrap: 'wrap', marginTop: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  filterText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: '600' },
  list: {},
  taskItem: {
    flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.bgCard,
    borderRadius: Radius.md, padding: Spacing.md, marginBottom: 8,
    borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, overflow: 'hidden', ...Shadow.sm,
  },
  taskItemDone: { opacity: 0.5 },
  priorityBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: Fonts.sizes.md, color: Colors.textPrimary, fontWeight: '600', marginBottom: 6 },
  taskTitleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  taskMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  pill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  pillText: { fontSize: Fonts.sizes.xs, fontWeight: '700' },
  dueBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full, backgroundColor: Colors.bgElevated },
  dueBadgeOverdue: { backgroundColor: Colors.coral + '20' },
  dueText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, fontWeight: '500' },
  taskNotes: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginBottom: 4 },
  createdAt: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  taskActions: { flexDirection: 'column', gap: 4 },
  actionBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: Colors.bgElevated },
  formLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: '600', marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.bgElevated },
  priorityText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: '600' },
  webAddBtn: { marginVertical: 16, paddingVertical: 14, borderRadius: Radius.md, alignItems: 'center', ...Shadow.sm },
  webAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
