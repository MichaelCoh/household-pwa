import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Colors, Fonts, Spacing, Radius, Shadow } from '../theme';

export function Card({ children, style, onPress }) {
  if (onPress) {
    return (
      <TouchableOpacity style={[styles.card, style]} onPress={onPress} activeOpacity={0.7}>
        {children}
      </TouchableOpacity>
    );
  }
  return <View style={[styles.card, style]}>{children}</View>;
}

export function ScreenHeader({ title, subtitle, accent, right }) {
  return (
    <View style={styles.screenHeader}>
      <View style={[styles.accentDot, { backgroundColor: accent || Colors.primary }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.screenTitle}>{title}</Text>
        {subtitle ? <Text style={styles.screenSubtitle}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

export function SectionLabel({ title, action, actionLabel }) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={styles.sectionLabelText}>{title}</Text>
      {action && (
        <TouchableOpacity onPress={action}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function EmptyState({ icon, title, subtitle, action, actionLabel }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIconWrap}>
        <Text style={styles.emptyIcon}>{icon}</Text>
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySubtitle}>{subtitle}</Text>
      {action && (
        <TouchableOpacity style={styles.emptyAction} onPress={action}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function FAB({ onPress, color = Colors.primary, icon = '+', style }) {
  return (
    <TouchableOpacity style={[styles.fab, { backgroundColor: color }, style]} onPress={onPress} activeOpacity={0.85}>
      <Text style={styles.fabIcon}>{icon}</Text>
    </TouchableOpacity>
  );
}

export function Input({ label, style, inputStyle, ...props }) {
  return (
    <View style={[styles.inputWrap, style]}>
      {label ? <Text style={styles.inputLabel}>{label}</Text> : null}
      <TextInput
        style={[styles.input, inputStyle]}
        placeholderTextColor={Colors.textMuted}
        {...props}
      />
    </View>
  );
}

export function Button({ label, onPress, color = Colors.primary, outline, icon, style, disabled }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.8}
      style={[
        styles.button,
        outline
          ? { borderWidth: 1.5, borderColor: color, backgroundColor: 'transparent' }
          : { backgroundColor: disabled ? Colors.textMuted : color },
        style,
      ]}
    >
      {icon ? <Text style={styles.buttonIcon}>{icon}</Text> : null}
      <Text style={[styles.buttonText, outline && { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function Checkbox({ checked, onPress, color = Colors.primary, size = 22 }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.checkbox,
        { width: size, height: size, borderRadius: size / 4 },
        checked && { backgroundColor: color, borderColor: color },
      ]}
      activeOpacity={0.7}
    >
      {checked && <Text style={[styles.checkmark, { fontSize: size * 0.6 }]}>✓</Text>}
    </TouchableOpacity>
  );
}

export function Pill({ label, color = Colors.primary, bg, style }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg || color + '20' }, style]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

export function IconButton({ icon, onPress, color = Colors.textSecondary, bg, size = 36 }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.iconButton, { width: size, height: size, borderRadius: size / 2, backgroundColor: bg || Colors.bgElevated }]}
      activeOpacity={0.7}
    >
      <Text style={{ fontSize: size * 0.45, color }}>{icon}</Text>
    </TouchableOpacity>
  );
}

export function StatCard({ label, value, icon, color, style }) {
  return (
    <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 3 }, style]}>
      <View style={[styles.statIconWrap, { backgroundColor: color + '15' }]}>
        <Text style={{ fontSize: 18 }}>{icon}</Text>
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    gap: 10,
    backgroundColor: Colors.bg,
  },
  accentDot: {
    width: 4,
    height: 32,
    borderRadius: 2,
  },
  screenTitle: {
    fontSize: Fonts.sizes.xxl,
    fontWeight: Fonts.weights.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  sectionLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    marginTop: Spacing.md,
  },
  sectionLabelText: {
    fontSize: Fonts.sizes.xs,
    fontWeight: Fonts.weights.bold,
    color: Colors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  sectionAction: {
    fontSize: Fonts.sizes.sm,
    color: Colors.primary,
    fontWeight: Fonts.weights.semibold,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: Spacing.xxl,
    paddingHorizontal: Spacing.xl,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: {
    fontSize: Fonts.sizes.lg,
    fontWeight: Fonts.weights.bold,
    color: Colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  emptyAction: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primaryLight,
    paddingHorizontal: Spacing.md,
    paddingVertical: 10,
    borderRadius: Radius.full,
  },
  emptyActionText: {
    fontSize: Fonts.sizes.sm,
    color: Colors.primary,
    fontWeight: Fonts.weights.semibold,
  },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.md,
  },
  fabIcon: { fontSize: 26, color: '#fff', lineHeight: 30 },
  inputWrap: { marginBottom: Spacing.md },
  inputLabel: {
    fontSize: Fonts.sizes.sm,
    color: Colors.textSecondary,
    fontWeight: Fonts.weights.medium,
    marginBottom: 6,
  },
  input: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.sm,
    borderWidth: 1.5,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: Fonts.sizes.md,
    color: Colors.textPrimary,
  },
  button: {
    borderRadius: Radius.sm,
    paddingVertical: 13,
    paddingHorizontal: Spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  buttonIcon: { fontSize: 16 },
  buttonText: {
    fontSize: Fonts.sizes.md,
    fontWeight: Fonts.weights.semibold,
    color: '#fff',
  },
  checkbox: {
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.bgCard,
  },
  checkmark: { color: '#fff', fontWeight: '700', lineHeight: undefined },
  pill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: Radius.full,
  },
  pillText: { fontSize: Fonts.sizes.xs, fontWeight: Fonts.weights.semibold },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: Spacing.sm },
  iconButton: { alignItems: 'center', justifyContent: 'center' },
  statCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: Radius.md,
    padding: Spacing.md,
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  statIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  statValue: {
    fontSize: Fonts.sizes.xl,
    fontWeight: Fonts.weights.heavy,
    color: Colors.textPrimary,
    letterSpacing: -0.5,
  },
  statLabel: {
    fontSize: Fonts.sizes.xs,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: Fonts.weights.medium,
  },
});
