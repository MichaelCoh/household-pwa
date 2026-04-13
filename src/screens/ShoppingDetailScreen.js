import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
  Alert, Animated,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow, TAB_COLORS } from '../theme';
import { ShoppingListStorage } from '../storage';
import { Checkbox, FAB, Input, SectionLabel } from '../components/UI';
import { timeAgo } from '../components/DatePicker';
import { BottomModal } from '../components/BottomModal';

const CATEGORIES = ['🥦 Produce', '🥩 Meat & Fish', '🥛 Dairy', '🍞 Bakery', '🧴 Hygiene', '🧹 Cleaning', '🍿 Snacks', '🥤 Drinks', '🧊 Frozen', '❓ General'];

function ItemRow({ item, onToggle, onDelete, color }) {
  return (
    <TouchableOpacity
      style={[styles.itemRow, item.checked && styles.itemRowChecked]}
      onLongPress={() => Alert.alert('Delete item', `Remove "${item.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(item.id) },
      ])}
      activeOpacity={0.7}
    >
      <Checkbox checked={item.checked} onPress={() => onToggle(item.id)} color={color} />
      <View style={styles.itemBody}>
        <Text style={[styles.itemName, item.checked && styles.itemNameDone]}>{item.name}</Text>
        <Text style={styles.itemMeta}>
          {item.category}{item.qty > 1 || item.unit ? ` · ${item.qty}${item.unit ? ' ' + item.unit : ''}` : ''}
        </Text>
        <Text style={styles.createdAt}>Added {timeAgo(item.createdAt)}</Text>
      </View>
      {item.qty > 1 && (
        <View style={[styles.qtyBadge, { backgroundColor: color + '15' }]}>
          <Text style={[styles.qtyText, { color }]}>×{item.qty}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ShoppingDetailScreen({ route, navigation }) {
  const { listId, listName } = route.params;
  const [list, setList] = useState(null);
  const [items, setItems] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('');
  const [category, setCategory] = useState('❓ General');
  const [clearAnim] = useState(new Animated.Value(1));

  const color = list?.color || TAB_COLORS.shopping;

  const load = useCallback(async () => {
    const lists = await ShoppingListStorage.getLists();
    const found = lists.find(l => l.id === listId);
    setList(found || { name: listName, color: TAB_COLORS.shopping, emoji: '🛒' });
    const its = await ShoppingListStorage.getItems(listId);
    setItems(its);
  }, [listId]);

  useFocusEffect(useCallback(() => {
    load();
    navigation.setOptions({ title: listName });
  }, [load]));

  const handleAdd = async () => {
    if (!name.trim()) return;
    await ShoppingListStorage.addItem(listId, name.trim(), parseInt(qty) || 1, unit.trim(), category);
    setName(''); setQty('1'); setUnit(''); setCategory('❓ General');
    setShowModal(false);
    load();
  };

  const handleToggle = async (id) => {
    await ShoppingListStorage.toggleItem(id);
    load();
  };

  const handleDelete = async (id) => {
    await ShoppingListStorage.deleteItem(id);
    load();
  };

  const handleClearDone = () => {
    const checkedCount = items.filter(i => i.checked).length;
    if (checkedCount === 0) return;
    Alert.alert(
      `Clear ${checkedCount} checked item${checkedCount > 1 ? 's' : ''}?`,
      'This will remove all checked items from this list.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await ShoppingListStorage.clearChecked(listId);
            load();
          },
        },
      ]
    );
  };

  const pending = items.filter(i => !i.checked);
  const checked = items.filter(i => i.checked);
  const progress = items.length > 0 ? checked.length / items.length : 0;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: color + '30' }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{list?.emoji} {list?.name || listName}</Text>
          <Text style={styles.headerMeta}>{checked.length}/{items.length} done</Text>
        </View>
        {checked.length > 0 && (
          <TouchableOpacity onPress={handleClearDone} style={[styles.clearBtn, { backgroundColor: color + '15', borderColor: color + '40' }]}>
            <Text style={[styles.clearBtnText, { color }]}>Clear done</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Progress bar */}
      {items.length > 0 && (
        <View style={styles.progressWrap}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.progressText}>{Math.round(progress * 100)}%</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {items.length === 0 && (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>List is empty</Text>
            <Text style={styles.emptySubtitle}>Tap + to add your first item</Text>
          </View>
        )}

        {pending.length > 0 && (
          <>
            <SectionLabel title={`To Get (${pending.length})`} />
            {pending.map(item => (
              <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} color={color} />
            ))}
          </>
        )}

        {checked.length > 0 && (
          <>
            <SectionLabel
              title={`In Cart (${checked.length})`}
              action={handleClearDone}
              actionLabel="Clear"
            />
            {checked.map(item => (
              <ItemRow key={item.id} item={item} onToggle={handleToggle} onDelete={handleDelete} color={color} />
            ))}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB onPress={() => setShowModal(true)} color={color} icon="+" />

      <BottomModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        title="Add Item"
        onSubmit={handleAdd}
        submitLabel="Add to List"
        submitColor={color}
      >
        <Input label="Item name" placeholder="e.g. Milk, Bread..." value={name} onChangeText={setName} autoFocus />

        <View style={styles.qtyRow}>
          <View style={{ flex: 1 }}>
            <Input label="Qty" placeholder="1" value={qty} onChangeText={setQty} keyboardType="numeric" style={{ marginBottom: 0 }} />
          </View>
          <View style={{ flex: 1.5, marginLeft: Spacing.sm }}>
            <Input label="Unit (optional)" placeholder="kg, L, pcs..." value={unit} onChangeText={setUnit} style={{ marginBottom: 0 }} />
          </View>
        </View>

        <Text style={styles.catLabel}>Category</Text>
        <View style={styles.categories}>
          {CATEGORIES.map(cat => (
            <TouchableOpacity
              key={cat}
              style={[styles.catChip, category === cat && { backgroundColor: color + '20', borderColor: color }]}
              onPress={() => setCategory(cat)}
            >
              <Text style={[styles.catText, category === cat && { color }]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </BottomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: 56,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    gap: Spacing.sm,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  backText: { fontSize: 28, color: Colors.textPrimary, lineHeight: 32 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: Colors.textPrimary },
  headerMeta: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 1 },
  clearBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  clearBtnText: { fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.bold },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    backgroundColor: Colors.bgCard,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 10,
  },
  progressTrack: { flex: 1, height: 6, backgroundColor: Colors.bgElevated, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, fontWeight: Fonts.weights.bold, minWidth: 32 },
  content: { paddingHorizontal: Spacing.md, paddingTop: Spacing.sm },
  emptyWrap: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: Spacing.md },
  emptyTitle: { fontSize: Fonts.sizes.lg, fontWeight: Fonts.weights.bold, color: Colors.textPrimary, marginBottom: 4 },
  emptySubtitle: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.sm,
    ...Shadow.sm,
  },
  itemRowChecked: { opacity: 0.55, backgroundColor: Colors.bgElevated },
  itemBody: { flex: 1 },
  itemName: { fontSize: Fonts.sizes.md, color: Colors.textPrimary, fontWeight: Fonts.weights.medium },
  itemNameDone: { textDecorationLine: 'line-through', color: Colors.textMuted },
  itemMeta: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginTop: 2 },
  qtyBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: Radius.full },
  qtyText: { fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.bold },
  createdAt: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginTop: 2 },
  qtyRow: { flexDirection: 'row', marginBottom: Spacing.md },
  catLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium, marginBottom: 8 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  catChip: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: Radius.full, borderWidth: 1.5,
    borderColor: Colors.border, backgroundColor: Colors.bgElevated,
  },
  catText: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, fontWeight: Fonts.weights.medium },
});
