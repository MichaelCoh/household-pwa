import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow, TAB_COLORS } from '../theme';
import { TaskStorage } from '../storage';
import { ScreenHeader, Checkbox, FAB, Input, EmptyState } from '../components/UI';
import { BottomModal } from '../components/BottomModal';
import { CalendarPicker, timeAgo } from '../components/DatePicker';

const PRIORITIES = [
  { key: 'high',   label: 'High',   color: '#FF5A5A', icon: '🔴' },
  { key: 'medium', label: 'Medium', color: '#FF9500', icon: '🟡' },
  { key: 'low',    label: 'Low',    color: '#34C759', icon: '🟢' },
];

const isWeb = Platform.OS === 'web';

function TaskItem({ task, onToggle, onEdit, onDelete }) {
  const p = PRIORITIES.find(x => x.key === task.priority) || PRIORITIES[1];
  const isOverdue = task.dueDate && !task.done && new Date(task.dueDate) < new Date();
  return (
    <View style={[styles.taskItem, task.done && styles.taskItemDone]}>
      <View style={[styles.priorityBar, { backgroundColor: p.color }]} />
      <Checkbox checked={task.done} onPress={() => onToggle(task.id)} color="#FF5A5A" />
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]} numberOfLines={2}>{task.title}</Text>
        <View style={styles.taskMeta}>
          <View style={[styles.pill, { backgroundColor: p.color + '25' }]}>
            <Text style={[styles.pillText, { color: p.color }]}>{p.icon} {p.label}</Text>
          </View>
          {task.dueDate ? (
            <View style={[styles.dueBadge, isOverdue && { backgroundColor: '#FF5A5A25' }]}>
              <Text style={[styles.dueText, isOverdue && { color: '#FF5A5A', fontWeight: '700' }]}>
                {isOverdue ? '⚠️ ' : '📅 '}{new Date(task.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </Text>
            </View>
          ) : null}
        </View>
        {task.notes ? <Text style={styles.taskNotes} numberOfLines={1}>📝 {task.notes}</Text> : null}
        <Text style={styles.createdAt}>Created {timeAgo(task.createdAt)}</Text>
      </View>
      <View style={styles.taskActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(task)}>
          <Text style={{ fontSize: 14 }}>✏️</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onDelete(task.id)}>
          <Text style={{ fontSize: 14 }}>🗑️</Text>
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

  const openAdd = () => { setEditingTask(null); setTitle(''); setPriority('medium'); setNotes(''); setDueDate(''); setShowModal(true); };
  const openEdit = (task) => { setEditingTask(task); setTitle(task.title); setPriority(task.priority); setNotes(task.notes || ''); setDueDate(task.dueDate || ''); setShowModal(true); };

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

  const handleDelete = async (id) => {
    await TaskStorage.remove(id);
    load();
  };

  const handleClearDone = () => {
    const n = tasks.filter(t => t.done).length;
    if (!n) return;
    Alert.alert('Clear completed tasks?', `Remove ${n} task${n > 1 ? 's' : ''}?`, [
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
      <ScreenHeader title="Tasks" subtitle={`${pendingCount} pending · ${doneCount} done`} accent="#FF5A5A" />
      <View style={[styles.inner, isWeb && styles.innerWeb]}>
        {overdueCount > 0 && (
          <View style={styles.overdueBar}>
            <Text style={styles.overdueText}>⚠️ {overdueCount} overdue task{overdueCount > 1 ? 's' : ''}</Text>
          </View>
        )}
        <View style={styles.filterRow}>
          {[['pending', `Pending (${pendingCount})`], ['done', `Done (${doneCount})`], ['all', 'All']].map(([k, l]) => (
            <TouchableOpacity key={k}
              style={[styles.filterChip, filter === k && { backgroundColor: '#FF5A5A20', borderColor: '#FF5A5A' }]}
              onPress={() => setFilter(k)}>
              <Text style={[styles.filterText, filter === k && { color: '#FF5A5A' }]}>{l}</Text>
            </TouchableOpacity>
          ))}
          {doneCount > 0 && (
            <TouchableOpacity style={[styles.filterChip, { borderColor: '#FF5A5A50', backgroundColor: '#FF5A5A10' }]} onPress={handleClearDone}>
              <Text style={[styles.filterText, { color: '#FF5A5A' }]}>Clear done</Text>
            </TouchableOpacity>
          )}
        </View>
        <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
          {filtered.length === 0
            ? <EmptyState icon="✅" title="All clear!" subtitle="Tap + to add a task" />
            : filtered.map(t => <TaskItem key={t.id} task={t}
                onToggle={async id => { await TaskStorage.toggle(id); load(); }}
                onEdit={openEdit}
                onDelete={handleDelete} />)
          }
          <View style={{ height: 100 }} />
        </ScrollView>
        {isWeb
          ? <TouchableOpacity style={styles.webAddBtn} onPress={openAdd}><Text style={styles.webAddBtnText}>+ New Task</Text></TouchableOpacity>
          : <FAB onPress={openAdd} color="#FF5A5A" />
        }
      </View>

      <BottomModal visible={showModal} onClose={() => setShowModal(false)}
        title={editingTask ? 'Edit Task' : 'New Task'}
        onSubmit={handleSave}
        submitLabel={editingTask ? 'Save Changes' : 'Create Task'}
        submitColor="#FF5A5A">
        <Input label="Task title" placeholder="What needs to be done?" value={title} onChangeText={setTitle} autoFocus multiline />
        <Text style={styles.formLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map(p => (
            <TouchableOpacity key={p.key}
              style={[styles.priorityChip, priority === p.key && { backgroundColor: p.color + '25', borderColor: p.color }]}
              onPress={() => setPriority(p.key)}>
              <Text style={[styles.priorityText, priority === p.key && { color: p.color }]}>{p.icon} {p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.formLabel}>Due date</Text>
        <CalendarPicker value={dueDate} onChange={setDueDate} accentColor="#FF5A5A" />
        <Input label="Notes (optional)" placeholder="Add details..." value={notes} onChangeText={setNotes} multiline numberOfLines={3} />
      </BottomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F8FA' },
  inner: { flex: 1, paddingHorizontal: 16 },
  innerWeb: { maxWidth: 860, alignSelf: 'center', width: '100%', paddingHorizontal: 40 },
  overdueBar: { backgroundColor: '#FF5A5A15', borderRadius: 8, padding: 10, marginBottom: 8, borderLeftWidth: 3, borderLeftColor: '#FF5A5A', marginTop: 4 },
  overdueText: { fontSize: 13, color: '#FF5A5A', fontWeight: '600' },
  filterRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap', marginTop: 4 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1.5, borderColor: '#E8EAF0', backgroundColor: '#FFFFFF' },
  filterText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  list: {},
  taskItem: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E8EAF0', gap: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  taskItemDone: { opacity: 0.5 },
  priorityBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 15, color: '#1A1D2E', fontWeight: '600', marginBottom: 6 },
  taskTitleDone: { textDecorationLine: 'line-through', color: '#9CA3AF' },
  taskMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  pill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
  pillText: { fontSize: 11, fontWeight: '700' },
  dueBadge: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, backgroundColor: '#F0F2F5' },
  dueText: { fontSize: 11, color: '#6B7280', fontWeight: '500' },
  taskNotes: { fontSize: 11, color: '#9CA3AF', marginBottom: 4 },
  createdAt: { fontSize: 10, color: '#9CA3AF', fontStyle: 'italic', marginTop: 2 },
  taskActions: { flexDirection: 'column', gap: 4 },
  actionBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: '#F0F2F5' },
  formLabel: { fontSize: 13, color: '#6B7280', fontWeight: '600', marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#E8EAF0', alignItems: 'center', backgroundColor: '#F0F2F5' },
  priorityText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  webAddBtn: { marginVertical: 16, paddingVertical: 14, borderRadius: 12, alignItems: 'center', backgroundColor: '#FF5A5A' },
  webAddBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
