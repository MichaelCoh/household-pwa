// ─── TASKS SCREEN ──────────────────────────────────────────────────────────
import { timeAgo } from '../components/DatePicker';
import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow, TAB_COLORS } from '../theme';
import { TaskStorage } from '../storage';
import { ScreenHeader, Checkbox, FAB, Input, SectionLabel, EmptyState } from '../components/UI';
import { BottomModal } from '../components/BottomModal';

const PRIORITIES = [
  { key: 'high', label: 'High', color: Colors.coral, icon: '🔴' },
  { key: 'medium', label: 'Medium', color: Colors.amber, icon: '🟡' },
  { key: 'low', label: 'Low', color: Colors.mint, icon: '🟢' },
];

function TaskItem({ task, onToggle, onDelete }) {
  const p = PRIORITIES.find(x => x.key === task.priority) || PRIORITIES[1];
  return (
    <TouchableOpacity
      style={[styles.taskItem, task.done && styles.taskItemDone]}
      onLongPress={() => Alert.alert('Delete task', `Remove "${task.title}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(task.id) },
      ])}
      activeOpacity={0.7}
    >
      <View style={[styles.taskPriorityBar, { backgroundColor: p.color }]} />
      <Checkbox checked={task.done} onPress={() => onToggle(task.id)} color={TAB_COLORS.tasks} />
      <View style={styles.taskBody}>
        <Text style={[styles.taskTitle, task.done && styles.taskTitleDone]} numberOfLines={2}>{task.title}</Text>
        <View style={styles.taskMeta}>
          <View style={[styles.taskPill, { backgroundColor: p.color + '20' }]}>
            <Text style={[styles.taskPillText, { color: p.color }]}>{p.icon} {p.label}</Text>
          </View>
          {task.dueDate ? (
            <Text style={styles.taskDue}>📅 {new Date(task.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</Text>
          ) : null}
        </View>
        {task.notes ? <Text style={styles.taskNotes} numberOfLines={1}>📝 {task.notes}</Text> : null}
      </View>
    </TouchableOpacity>
  );
}

export function TasksScreen() {
  const [tasks, setTasks] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState('medium');
  const [notes, setNotes] = useState('');
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    const all = await TaskStorage.getAll();
    const sorted = [...all].sort((a, b) => {
      if (a.done !== b.done) return a.done ? 1 : -1;
      const order = { high: 0, medium: 1, low: 2 };
      return (order[a.priority] || 1) - (order[b.priority] || 1);
    });
    setTasks(sorted);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!title.trim()) return;
    await TaskStorage.add(title.trim(), priority, null, notes.trim());
    setTitle(''); setPriority('medium'); setNotes('');
    setShowModal(false);
    load();
  };

  const handleClearDone = () => {
    const doneCount = tasks.filter(t => t.done).length;
    if (!doneCount) return;
    Alert.alert(`Clear ${doneCount} completed task${doneCount > 1 ? 's' : ''}?`, '', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: async () => { await TaskStorage.clearDone(); load(); } },
    ]);
  };

  const filtered = filter === 'all' ? tasks : filter === 'done' ? tasks.filter(t => t.done) : tasks.filter(t => !t.done);
  const doneCount = tasks.filter(t => t.done).length;
  const pendingCount = tasks.filter(t => !t.done).length;

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Tasks"
        subtitle={`${pendingCount} pending · ${doneCount} done`}
        accent={TAB_COLORS.tasks}
        right={doneCount > 0 ? (
          <TouchableOpacity onPress={handleClearDone} style={[styles.clearBtn, { backgroundColor: Colors.coral + '15', borderColor: Colors.coral + '40' }]}>
            <Text style={[styles.clearBtnText, { color: Colors.coral }]}>Clear done</Text>
          </TouchableOpacity>
        ) : null}
      />

      <View style={styles.filterRow}>
        {[['pending', `Pending (${pendingCount})`], ['done', `Done (${doneCount})`], ['all', 'All']].map(([k, l]) => (
          <TouchableOpacity key={k}
            style={[styles.filterChip, filter === k && { backgroundColor: TAB_COLORS.tasks + '20', borderColor: TAB_COLORS.tasks }]}
            onPress={() => setFilter(k)}>
            <Text style={[styles.filterText, filter === k && { color: TAB_COLORS.tasks }]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {filtered.length === 0
          ? <EmptyState icon="✅" title="All clear!" subtitle="Tap + to add a task" />
          : filtered.map(t => <TaskItem key={t.id} task={t} onToggle={async (id) => { await TaskStorage.toggle(id); load(); }} onDelete={async (id) => { await TaskStorage.remove(id); load(); }} />)
        }
        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB onPress={() => setShowModal(true)} color={TAB_COLORS.tasks} />

      <BottomModal visible={showModal} onClose={() => setShowModal(false)} title="New Task" onSubmit={handleAdd} submitLabel="Create" submitColor={TAB_COLORS.tasks}>
        <Input label="Task title" placeholder="What needs to be done?" value={title} onChangeText={setTitle} autoFocus multiline />
        <Text style={styles.priorityLabel}>Priority</Text>
        <View style={styles.priorityRow}>
          {PRIORITIES.map(p => (
            <TouchableOpacity key={p.key}
              style={[styles.priorityChip, priority === p.key && { backgroundColor: p.color + '20', borderColor: p.color }]}
              onPress={() => setPriority(p.key)}>
              <Text style={[styles.priorityText, priority === p.key && { color: p.color }]}>{p.icon} {p.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input label="Notes (optional)" placeholder="Add details..." value={notes} onChangeText={setNotes} multiline />
      </BottomModal>
    </View>
  );
}

// ─── CALENDAR SCREEN ───────────────────────────────────────────────────────
import { EventStorage } from '../storage';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const EVENT_COLORS = ['#5B6AF0', '#00BFA5', '#FF5A5A', '#FF9500', '#9C6FFF', '#2196F3'];

export function CalendarScreen() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [events, setEvents] = useState([]);
  const [selectedDate, setSelectedDate] = useState(now.toISOString().split('T')[0]);
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('');
  const [notes, setNotes] = useState('');
  const [color, setColor] = useState(TAB_COLORS.calendar);

  const load = useCallback(async () => {
    setEvents(await EventStorage.getForMonth(viewYear, viewMonth));
  }, [viewYear, viewMonth]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();
  const dateStr = (d) => `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const hasEvent = (d) => events.some(e => e.date === dateStr(d));
  const isToday = (d) => now.getFullYear() === viewYear && now.getMonth() === viewMonth && now.getDate() === d;
  const isSelected = (d) => selectedDate === dateStr(d);

  const prevMonth = () => { if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); } else setViewMonth(m => m - 1); };
  const nextMonth = () => { if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); } else setViewMonth(m => m + 1); };

  const handleAdd = async () => {
    if (!title.trim()) return;
    await EventStorage.add(title.trim(), selectedDate, time.trim() || null, color, notes.trim());
    setTitle(''); setTime(''); setNotes(''); setColor(TAB_COLORS.calendar);
    setShowModal(false);
    load();
  };

  const selectedLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  const selectedEvents = events.filter(e => e.date === selectedDate);
  const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)];
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      <ScreenHeader title="Calendar" subtitle={`${MONTHS[viewMonth]} ${viewYear}`} accent={TAB_COLORS.calendar} />
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={styles.navBtn}><Text style={styles.navBtnText}>‹</Text></TouchableOpacity>
          <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
          <TouchableOpacity onPress={nextMonth} style={styles.navBtn}><Text style={styles.navBtnText}>›</Text></TouchableOpacity>
        </View>

        <View style={styles.calCard}>
          <View style={styles.dayHeaders}>
            {DAYS.map(d => <View key={d} style={styles.dayHeader}><Text style={styles.dayHeaderText}>{d}</Text></View>)}
          </View>
          {rows.map((row, ri) => (
            <View key={ri} style={styles.calRow}>
              {[...row, ...Array(7 - row.length).fill(null)].map((d, ci) => (
                <TouchableOpacity key={ci} style={[styles.calCell, isSelected(d) && { backgroundColor: TAB_COLORS.calendar }, isToday(d) && !isSelected(d) && styles.calCellToday]} onPress={() => d && setSelectedDate(dateStr(d))} disabled={!d}>
                  {d ? <>
                    <Text style={[styles.calDay, isSelected(d) && { color: '#fff', fontWeight: '700' }, isToday(d) && !isSelected(d) && { color: TAB_COLORS.calendar, fontWeight: '700' }]}>{d}</Text>
                    {hasEvent(d) && <View style={[styles.calDot, isSelected(d) && { backgroundColor: '#fff' }]} />}
                  </> : null}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        <View style={{ paddingHorizontal: Spacing.md }}>
          <SectionLabel title={selectedLabel} action={() => setShowModal(true)} actionLabel="+ Add" />
          {selectedEvents.length === 0
            ? <View style={styles.noEvents}><Text style={styles.noEventsText}>No events · tap "+ Add" to create one</Text></View>
            : selectedEvents.map(e => (
              <TouchableOpacity key={e.id} style={styles.eventItem}
                onLongPress={() => Alert.alert('Delete event', `Remove "${e.title}"?`, [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Delete', style: 'destructive', onPress: async () => { await EventStorage.remove(e.id); load(); } },
                ])}>
                <View style={[styles.eventBar, { backgroundColor: e.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>{e.title}</Text>
                  {e.time ? <Text style={styles.eventTime}>🕐 {e.time}</Text> : null}
                  {e.notes ? <Text style={styles.eventNotes} numberOfLines={1}>{e.notes}</Text> : null}
                  <Text style={styles.eventCreated}>{timeAgo(e.createdAt)}</Text>
                </View>
              </TouchableOpacity>
            ))
          }
        </View>
        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB onPress={() => setShowModal(true)} color={TAB_COLORS.calendar} />

      <BottomModal visible={showModal} onClose={() => setShowModal(false)} title="New Event" onSubmit={handleAdd} submitLabel="Add Event" submitColor={TAB_COLORS.calendar}>
        <Input label="Event title" placeholder="What's happening?" value={title} onChangeText={setTitle} autoFocus />
        <Input label="Time (optional)" placeholder="e.g. 3:30 PM" value={time} onChangeText={setTime} />
        <Input label="Notes (optional)" placeholder="Add details..." value={notes} onChangeText={setNotes} multiline />
        <Text style={styles.colorLabel}>Color</Text>
        <View style={styles.colorPickerRow}>
          {EVENT_COLORS.map(c => (
            <TouchableOpacity key={c} style={[styles.colorSwatch, { backgroundColor: c }, color === c && styles.colorSelected]} onPress={() => setColor(c)} />
          ))}
        </View>
        <View style={[styles.selectedDateTag, { backgroundColor: color + '15', borderColor: color + '40' }]}>
          <Text style={[styles.selectedDateTagText, { color }]}>📅 {selectedLabel}</Text>
        </View>
      </BottomModal>
    </View>
  );
}

// ─── BUDGET SCREEN ─────────────────────────────────────────────────────────
import { BudgetStorage, SettingsStorage } from '../storage';

const EXPENSE_CATS = ['🍔 Food', '🚗 Transport', '🏠 Housing', '💊 Health', '👕 Shopping', '🎬 Entertainment', '💡 Utilities', '📱 Tech', '🎓 Education', '💸 Other'];
const INCOME_CATS = ['💼 Salary', '💰 Freelance', '🎁 Gift', '📈 Investment', '💵 Other'];

export function BudgetScreen() {
  const now = new Date();
  const [items, setItems] = useState([]);
  const [settings, setSettings] = useState({ monthlyBudget: 0 });
  const [showModal, setShowModal] = useState(false);
  const [type, setType] = useState('expense');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('💸 Other');
  const [date, setDate] = useState(now.toISOString().split('T')[0]);

  const load = useCallback(async () => {
    const [data, cfg] = await Promise.all([
      BudgetStorage.getForMonth(now.getFullYear(), now.getMonth()),
      SettingsStorage.get(),
    ]);
    setItems([...data].sort((a, b) => new Date(b.date) - new Date(a.date)));
    setSettings(cfg);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const income = items.filter(i => i.type === 'income').reduce((s, i) => s + i.amount, 0);
  const expense = items.filter(i => i.type === 'expense').reduce((s, i) => s + i.amount, 0);
  const budget = parseFloat(settings.monthlyBudget) || 0;
  const percent = budget > 0 ? Math.min((expense / budget) * 100, 100) : 0;

  const handleAdd = async () => {
    if (!description.trim() || !amount) return;
    await BudgetStorage.add(description.trim(), amount, category, type, date);
    setDescription(''); setAmount(''); setCategory(type === 'expense' ? '💸 Other' : '💵 Other');
    setShowModal(false);
    load();
  };

  const grouped = items.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = [];
    acc[item.date].push(item);
    return acc;
  }, {});

  return (
    <View style={styles.container}>
      <ScreenHeader title="Budget" subtitle={now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} accent={TAB_COLORS.budget} />

      <View style={styles.summaryCard}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Income</Text>
            <Text style={[styles.summaryAmount, { color: Colors.mint }]}>${income.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={[styles.summaryAmount, { color: Colors.coral }]}>${expense.toFixed(2)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryLabel}>Balance</Text>
            <Text style={[styles.summaryAmount, { color: income - expense >= 0 ? Colors.mint : Colors.coral }]}>${(income - expense).toFixed(2)}</Text>
          </View>
        </View>
        {budget > 0 && (
          <View style={styles.budgetRow}>
            <View style={styles.budgetLabels}>
              <Text style={styles.budgetLabel}>Monthly budget: ${budget}</Text>
              <Text style={[styles.budgetLabel, { color: percent >= 100 ? Colors.coral : Colors.mint }]}>
                {percent >= 100 ? `Over by $${(expense - budget).toFixed(0)}` : `$${(budget - expense).toFixed(0)} left`}
              </Text>
            </View>
            <View style={styles.budgetTrack}>
              <View style={[styles.budgetFill, { width: `${percent}%`, backgroundColor: percent >= 100 ? Colors.coral : percent > 75 ? Colors.amber : Colors.mint }]} />
            </View>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: Spacing.md }} showsVerticalScrollIndicator={false}>
        {items.length === 0
          ? <EmptyState icon="💳" title="No transactions yet" subtitle="Tap + to record your first expense" />
          : Object.keys(grouped).sort((a, b) => b.localeCompare(a)).map(dk => (
            <View key={dk}>
              <View style={styles.dateDivider}>
                <Text style={styles.dateLabel}>{new Date(dk + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
              </View>
              {grouped[dk].map(item => (
                <TouchableOpacity key={item.id} style={styles.expItem}
                  onLongPress={() => Alert.alert('Delete', `Remove "${item.description}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    { text: 'Delete', style: 'destructive', onPress: async () => { await BudgetStorage.remove(item.id); load(); } },
                  ])}>
                  <View style={[styles.expIcon, { backgroundColor: item.type === 'income' ? Colors.mint + '20' : Colors.coral + '20' }]}>
                    <Text style={{ fontSize: 20 }}>{item.category.split(' ')[0]}</Text>
                  </View>
                  <View style={styles.expBody}>
                    <Text style={styles.expTitle} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.expCat}>{item.category}</Text>
                  </View>
                  <Text style={[styles.expAmount, { color: item.type === 'income' ? Colors.mint : Colors.coral }]}>
                    {item.type === 'income' ? '+' : '-'}${item.amount.toFixed(2)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))
        }
        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB onPress={() => setShowModal(true)} color={TAB_COLORS.budget} />

      <BottomModal visible={showModal} onClose={() => setShowModal(false)} title="Add Transaction" onSubmit={handleAdd} submitLabel="Add" submitColor={TAB_COLORS.budget}>
        <View style={styles.typeToggle}>
          {[['expense', '💸 Expense'], ['income', '💵 Income']].map(([k, l]) => (
            <TouchableOpacity key={k}
              style={[styles.typeBtn, type === k && { backgroundColor: k === 'expense' ? Colors.coral + '20' : Colors.mint + '20', borderColor: k === 'expense' ? Colors.coral : Colors.mint }]}
              onPress={() => { setType(k); setCategory(k === 'expense' ? '💸 Other' : '💵 Other'); }}>
              <Text style={[styles.typeBtnText, type === k && { color: k === 'expense' ? Colors.coral : Colors.mint }]}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Input label="Description" placeholder="What was this for?" value={description} onChangeText={setDescription} autoFocus />
        <Input label="Amount ($)" placeholder="0.00" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" />
        <Input label="Date" placeholder="YYYY-MM-DD" value={date} onChangeText={setDate} />
        <Text style={styles.catLabel}>Category</Text>
        <View style={styles.catGrid}>
          {(type === 'expense' ? EXPENSE_CATS : INCOME_CATS).map(cat => (
            <TouchableOpacity key={cat}
              style={[styles.catChip, category === cat && { backgroundColor: (type === 'expense' ? Colors.coral : Colors.mint) + '20', borderColor: type === 'expense' ? Colors.coral : Colors.mint }]}
              onPress={() => setCategory(cat)}>
              <Text style={[styles.catChipText, category === cat && { color: type === 'expense' ? Colors.coral : Colors.mint }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomModal>
    </View>
  );
}

// ─── SETTINGS SCREEN ───────────────────────────────────────────────────────
export function SettingsScreen() {
  const [settings, setSettings] = useState({ name: '', monthlyBudget: '', currency: 'USD' });
  const [editing, setEditing] = useState(false);
  const [formName, setFormName] = useState('');
  const [formBudget, setFormBudget] = useState('');

  useFocusEffect(useCallback(async () => {
    const cfg = await SettingsStorage.get();
    setSettings(cfg);
    setFormName(cfg.name || '');
    setFormBudget(cfg.monthlyBudget ? String(cfg.monthlyBudget) : '');
  }, []));

  const handleSave = async () => {
    const updated = { ...settings, name: formName.trim(), monthlyBudget: parseFloat(formBudget) || 0 };
    await SettingsStorage.save(updated);
    setSettings(updated);
    setEditing(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingHorizontal: Spacing.md }} showsVerticalScrollIndicator={false}>
      <ScreenHeader title="Settings" accent={Colors.primary} />

      <Text style={styles.settingsSectionTitle}>PROFILE</Text>
      <View style={styles.settingsCard}>
        {editing ? (
          <View style={{ padding: Spacing.md }}>
            <Input label="Your name" placeholder="Name" value={formName} onChangeText={setFormName} />
            <Input label="Monthly budget ($)" placeholder="0.00" value={formBudget} onChangeText={setFormBudget} keyboardType="decimal-pad" />
            <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: Colors.bgElevated }]} onPress={() => setEditing(false)}><Text style={{ color: Colors.textSecondary, fontWeight: '600', fontSize: 15 }}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.saveBtn, { flex: 2, backgroundColor: Colors.primary }]} onPress={handleSave}><Text style={{ color: '#fff', fontWeight: '600', fontSize: 15 }}>Save</Text></TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {[['👤', 'Name', settings.name || 'Not set'], ['💰', 'Monthly Budget', settings.monthlyBudget ? `$${settings.monthlyBudget}` : 'Not set']].map(([icon, label, value]) => (
              <TouchableOpacity key={label} style={styles.settingsRow} onPress={() => setEditing(true)}>
                <Text style={styles.settingsIcon}>{icon}</Text>
                <Text style={styles.settingsLabel}>{label}</Text>
                <Text style={styles.settingsValue}>{value}</Text>
              </TouchableOpacity>
            ))}
          </>
        )}
      </View>

      <Text style={styles.settingsSectionTitle}>ABOUT</Text>
      <View style={styles.settingsCard}>
        {[['📱', 'App', 'Household'], ['🔖', 'Version', '1.0.0'], ['💾', 'Storage', 'Local only'], ['🔒', 'Privacy', 'No data shared']].map(([icon, label, value]) => (
          <View key={label} style={styles.settingsRow}>
            <Text style={styles.settingsIcon}>{icon}</Text>
            <Text style={styles.settingsLabel}>{label}</Text>
            <Text style={styles.settingsValue}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  listContent: { paddingHorizontal: Spacing.md },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgCard },
  filterText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium },
  taskItem: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: Colors.bgCard, borderRadius: Radius.md,
    padding: Spacing.md, marginBottom: 6, borderWidth: 1, borderColor: Colors.border,
    gap: Spacing.sm, overflow: 'hidden', ...Shadow.sm,
  },
  taskItemDone: { opacity: 0.5 },
  taskPriorityBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3 },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: Fonts.sizes.md, color: Colors.textPrimary, fontWeight: Fonts.weights.medium, marginBottom: 6 },
  taskTitleDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  taskMeta: { flexDirection: 'row', gap: 6, alignItems: 'center', flexWrap: 'wrap' },
  taskPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: Radius.full },
  taskPillText: { fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.semibold },
  taskDue: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  taskNotes: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginTop: 4 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1 },
  clearBtnText: { fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.bold },
  priorityLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium, marginBottom: 8 },
  priorityRow: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  priorityChip: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.bgElevated },
  priorityText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium },
  // Calendar
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
  navBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', ...Shadow.sm },
  navBtnText: { fontSize: 22, color: Colors.textPrimary },
  monthLabel: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: Colors.textPrimary },
  calCard: { marginHorizontal: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.sm, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Shadow.sm },
  dayHeaders: { flexDirection: 'row' },
  dayHeader: { flex: 1, alignItems: 'center', paddingVertical: 6 },
  dayHeaderText: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, fontWeight: Fonts.weights.bold },
  calRow: { flexDirection: 'row' },
  calCell: { flex: 1, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  calCellToday: { borderWidth: 1.5, borderColor: TAB_COLORS.calendar },
  calDay: { fontSize: Fonts.sizes.sm, color: Colors.textPrimary },
  calDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: TAB_COLORS.calendar, position: 'absolute', bottom: 4 },
  noEvents: { backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  noEventsText: { color: Colors.textMuted, fontSize: Fonts.sizes.sm },
  eventItem: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 6, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, ...Shadow.sm },
  eventBar: { width: 4, minHeight: 20, borderRadius: 2 },
  eventTitle: { fontSize: Fonts.sizes.md, color: Colors.textPrimary, fontWeight: Fonts.weights.medium },
  eventTime: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary },
  eventNotes: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, marginTop: 2 },
  eventCreated: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: 3 },
  colorLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium, marginBottom: 8 },
  colorPickerRow: { flexDirection: 'row', gap: 10, marginBottom: Spacing.md },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 3, borderColor: Colors.textPrimary },
  selectedDateTag: { padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1, marginBottom: Spacing.sm },
  selectedDateTagText: { fontSize: Fonts.sizes.sm, fontWeight: Fonts.weights.semibold },
  // Budget
  summaryCard: { marginHorizontal: Spacing.md, backgroundColor: Colors.bgCard, borderRadius: Radius.lg, padding: Spacing.md, borderWidth: 1, borderColor: Colors.border, marginBottom: Spacing.md, ...Shadow.sm },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLabel: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginBottom: 4 },
  summaryAmount: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.heavy },
  summaryDivider: { width: 1, height: 32, backgroundColor: Colors.border },
  budgetRow: { marginTop: Spacing.md },
  budgetLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  budgetLabel: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary },
  budgetTrack: { height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  budgetFill: { height: '100%', borderRadius: 3 },
  dateDivider: { paddingVertical: 8 },
  dateLabel: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, fontWeight: Fonts.weights.bold, textTransform: 'uppercase' },
  expItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.bgCard, borderRadius: Radius.md, padding: Spacing.md, marginBottom: 6, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm, ...Shadow.sm },
  expIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  expBody: { flex: 1 },
  expTitle: { fontSize: Fonts.sizes.md, color: Colors.textPrimary, fontWeight: Fonts.weights.medium },
  expCat: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  expAmount: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold },
  expCreated: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: 1 },
  typeToggle: { flexDirection: 'row', gap: 8, marginBottom: Spacing.md },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: Radius.sm, borderWidth: 1.5, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.bgElevated },
  typeBtnText: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.semibold },
  catLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium, marginBottom: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  catChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.border, backgroundColor: Colors.bgElevated },
  catChipText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, fontWeight: Fonts.weights.medium },
  // Settings
  settingsSectionTitle: { fontSize: Fonts.sizes.xs, color: Colors.textMuted, fontWeight: Fonts.weights.bold, letterSpacing: 1, marginTop: Spacing.md, marginBottom: 8, paddingLeft: 4 },
  settingsCard: { backgroundColor: Colors.bgCard, borderRadius: Radius.lg, borderWidth: 1, borderColor: Colors.border, overflow: 'hidden', ...Shadow.sm },
  settingsRow: { flexDirection: 'row', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border, gap: 10 },
  settingsIcon: { fontSize: 20, width: 28 },
  settingsLabel: { flex: 1, fontSize: Fonts.sizes.md, color: Colors.textPrimary },
  settingsValue: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary },
  saveBtn: { paddingVertical: 13, borderRadius: Radius.sm, alignItems: 'center', flex: 1 },
  EmptyState: {},
});
