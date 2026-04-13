import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Colors, Fonts, Spacing, Radius, Shadow, TAB_COLORS } from '../theme';
import { ShoppingListStorage } from '../storage';
import { ScreenHeader, EmptyState, FAB, Input, Button } from '../components/UI';
import { timeAgo } from '../components/DatePicker';
import { BottomModal } from '../components/BottomModal';

const LIST_EMOJIS = ['🛒', '🥦', '🏠', '💊', '🎁', '🐾', '🍷', '🧹', '👕', '🎮'];
const LIST_COLORS = ['#00BFA5', '#5B6AF0', '#FF5A5A', '#FF9500', '#9C6FFF', '#2196F3', '#34C759', '#FF6B9D'];

function ListCard({ list, itemCount, checkedCount, onPress, onLongPress }) {
  const progress = itemCount > 0 ? checkedCount / itemCount : 0;
  return (
    <TouchableOpacity style={styles.listCard} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <View style={[styles.listCardLeft, { backgroundColor: list.color + '20' }]}>
        <Text style={styles.listEmoji}>{list.emoji}</Text>
      </View>
      <View style={styles.listCardBody}>
        <Text style={styles.listName}>{list.name}</Text>
        <Text style={styles.listMeta}>
          {itemCount === 0 ? 'Empty list' : `${checkedCount}/${itemCount} items`}
        </Text>
        <Text style={styles.listCreated}>Created {timeAgo(list.createdAt)}</Text>
        {itemCount > 0 && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: list.color }]} />
          </View>
        )}
      </View>
      <View style={[styles.listChevron]}>
        <Text style={{ color: Colors.textMuted, fontSize: 18 }}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ShoppingListsScreen({ navigation }) {
  const [lists, setLists] = useState([]);
  const [itemCounts, setItemCounts] = useState({});
  const [checkedCounts, setCheckedCounts] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('🛒');
  const [selectedColor, setSelectedColor] = useState('#00BFA5');

  const load = useCallback(async () => {
    const ls = await ShoppingListStorage.getLists();
    setLists(ls);
    const allItems = await ShoppingListStorage.getAllItems();
    const counts = {}, checked = {};
    ls.forEach(l => {
      const items = allItems.filter(i => i.listId === l.id);
      counts[l.id] = items.length;
      checked[l.id] = items.filter(i => i.checked).length;
    });
    setItemCounts(counts);
    setCheckedCounts(checked);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!name.trim()) return;
    const list = await ShoppingListStorage.createList(name.trim(), selectedEmoji, selectedColor);
    setName(''); setSelectedEmoji('🛒'); setSelectedColor('#00BFA5');
    setShowModal(false);
    navigation.navigate('ShoppingDetail', { listId: list.id, listName: list.name });
    load();
  };

  const handleLongPress = (list) => {
    Alert.alert(list.name, 'What would you like to do?', [
      { text: 'Rename', onPress: () => {} },
      { text: 'Delete List', style: 'destructive', onPress: async () => {
        await ShoppingListStorage.deleteList(list.id);
        load();
      }},
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenHeader
        title="Shopping"
        subtitle={`${lists.length} list${lists.length !== 1 ? 's' : ''}`}
        accent={TAB_COLORS.shopping}
      />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {lists.length === 0 ? (
          <EmptyState
            icon="🛒"
            title="No shopping lists yet"
            subtitle="Create a list for groceries, pharmacy, or anything else"
            action={() => setShowModal(true)}
            actionLabel="Create first list"
          />
        ) : (
          <>
            {lists.map(list => (
              <ListCard
                key={list.id}
                list={list}
                itemCount={itemCounts[list.id] || 0}
                checkedCount={checkedCounts[list.id] || 0}
                onPress={() => navigation.navigate('ShoppingDetail', { listId: list.id, listName: list.name })}
                onLongPress={() => handleLongPress(list)}
              />
            ))}
          </>
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <FAB onPress={() => setShowModal(true)} color={TAB_COLORS.shopping} icon="+" />

      <BottomModal
        visible={showModal}
        onClose={() => setShowModal(false)}
        title="New Shopping List"
        onSubmit={handleCreate}
        submitLabel="Create List"
        submitColor={TAB_COLORS.shopping}
      >
        <Input label="List name" placeholder="e.g. Weekly Groceries" value={name} onChangeText={setName} autoFocus />

        <Text style={styles.pickerLabel}>Icon</Text>
        <View style={styles.emojiRow}>
          {LIST_EMOJIS.map(e => (
            <TouchableOpacity
              key={e}
              style={[styles.emojiChip, selectedEmoji === e && { backgroundColor: selectedColor + '30', borderColor: selectedColor }]}
              onPress={() => setSelectedEmoji(e)}
            >
              <Text style={{ fontSize: 22 }}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.pickerLabel}>Color</Text>
        <View style={styles.colorRow}>
          {LIST_COLORS.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.colorSwatch, { backgroundColor: c }, selectedColor === c && styles.colorSelected]}
              onPress={() => setSelectedColor(c)}
            />
          ))}
        </View>
      </BottomModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  content: { paddingHorizontal: Spacing.md },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadow.sm,
  },
  listCardLeft: {
    width: 52,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listEmoji: { fontSize: 26 },
  listCardBody: { flex: 1 },
  listName: { fontSize: Fonts.sizes.md, fontWeight: Fonts.weights.bold, color: Colors.textPrimary, marginBottom: 3 },
  listMeta: { fontSize: Fonts.sizes.xs, color: Colors.textSecondary, marginBottom: 3 },
  listCreated: { fontSize: 10, color: Colors.textMuted, fontStyle: 'italic', marginBottom: 6 },
  progressTrack: { height: 4, backgroundColor: Colors.bgElevated, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  listChevron: { paddingLeft: 4 },
  pickerLabel: { fontSize: Fonts.sizes.sm, color: Colors.textSecondary, fontWeight: Fonts.weights.medium, marginBottom: 8 },
  emojiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.md },
  emojiChip: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: Colors.bgElevated, borderWidth: 1.5, borderColor: Colors.border,
  },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: Spacing.md },
  colorSwatch: { width: 32, height: 32, borderRadius: 16 },
  colorSelected: { borderWidth: 3, borderColor: Colors.textPrimary },
});
