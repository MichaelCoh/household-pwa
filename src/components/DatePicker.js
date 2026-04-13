import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, Fonts, Spacing, Radius, Shadow } from '../theme';

const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function CalendarPicker({ value, onChange, accentColor = Colors.primary }) {
  const today = new Date();
  const initial = value && value.match(/^\d{4}-\d{2}-\d{2}$/)
    ? new Date(value + 'T00:00:00')
    : today;

  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstDay = new Date(viewYear, viewMonth, 1).getDay();

  const dateStr = (d) =>
    `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const isSelected = (d) => value === dateStr(d);
  const isToday = (d) =>
    today.getFullYear() === viewYear &&
    today.getMonth() === viewMonth &&
    today.getDate() === d;
  const isPast = (d) => new Date(dateStr(d)) < new Date(today.toDateString());

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const cells = [...Array(firstDay).fill(null), ...Array(daysInMonth).fill(0).map((_, i) => i + 1)];
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  return (
    <View style={styles.container}>
      {/* Month nav */}
      <View style={styles.nav}>
        <TouchableOpacity onPress={prevMonth} style={styles.navBtn}>
          <Text style={styles.navArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthLabel}>{MONTHS[viewMonth]} {viewYear}</Text>
        <TouchableOpacity onPress={nextMonth} style={styles.navBtn}>
          <Text style={styles.navArrow}>›</Text>
        </TouchableOpacity>
      </View>

      {/* Day headers */}
      <View style={styles.dayHeaders}>
        {DAYS.map(d => (
          <View key={d} style={styles.dayHeader}>
            <Text style={styles.dayHeaderText}>{d}</Text>
          </View>
        ))}
      </View>

      {/* Calendar grid */}
      {rows.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {[...row, ...Array(7 - row.length).fill(null)].map((d, ci) => {
            const selected = d && isSelected(d);
            const todayCell = d && isToday(d);
            const past = d && isPast(d) && !todayCell;

            return (
              <TouchableOpacity
                key={ci}
                style={[
                  styles.cell,
                  selected && { backgroundColor: accentColor },
                  todayCell && !selected && styles.cellToday,
                ]}
                onPress={() => d && onChange(dateStr(d))}
                disabled={!d}
                activeOpacity={0.7}
              >
                {d ? (
                  <Text style={[
                    styles.cellText,
                    past && styles.cellTextPast,
                    todayCell && !selected && { color: accentColor, fontWeight: '700' },
                    selected && { color: '#fff', fontWeight: '700' },
                  ]}>
                    {d}
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}

      {/* Selected date display */}
      {value && (
        <View style={[styles.selectedBadge, { backgroundColor: accentColor + '15', borderColor: accentColor + '40' }]}>
          <Text style={[styles.selectedText, { color: accentColor }]}>
            📅 {new Date(value + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </Text>
          <TouchableOpacity onPress={() => onChange('')} style={styles.clearDate}>
            <Text style={[styles.clearDateText, { color: accentColor }]}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// Compact time-ago helper
export function timeAgo(timestamp) {
  if (!timestamp) return '';
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
    paddingHorizontal: 4,
  },
  navBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: Colors.bgCard, borderWidth: 1, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  navArrow: { fontSize: 20, color: Colors.textPrimary, lineHeight: 24 },
  monthLabel: { fontSize: Fonts.sizes.md, fontWeight: '700', color: Colors.textPrimary },
  dayHeaders: { flexDirection: 'row', marginBottom: 4 },
  dayHeader: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dayHeaderText: { fontSize: 11, fontWeight: '700', color: Colors.textMuted, textTransform: 'uppercase' },
  row: { flexDirection: 'row' },
  cell: {
    flex: 1, height: 36, alignItems: 'center', justifyContent: 'center',
    borderRadius: 18, margin: 1,
  },
  cellToday: { borderWidth: 1.5, borderColor: Colors.primary },
  cellText: { fontSize: Fonts.sizes.sm, color: Colors.textPrimary },
  cellTextPast: { color: Colors.textMuted },
  selectedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: Spacing.sm, padding: Spacing.sm, borderRadius: Radius.sm, borderWidth: 1,
  },
  selectedText: { fontSize: Fonts.sizes.sm, fontWeight: '600', flex: 1 },
  clearDate: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  clearDateText: { fontSize: 13, fontWeight: '700' },
});
