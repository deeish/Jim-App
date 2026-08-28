import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { radius, spacing, text, useTheme, weight } from '../theme';
import GlassSurface, { glassAvailable } from './GlassSurface';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { kgToLb, lbToKg } from '../lib/weightDisplay';
import { haptics } from '../lib/haptics';
import {
  listWeighIns,
  logWeighIn,
  type BodyWeightEntry,
} from '../services/bodyWeightService';

interface LogWeightSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called with the saved entry after a successful POST. */
  onLogged?: (entry: BodyWeightEntry) => void;
  /**
   * Last known weight (lb) used to prefill the field. Pass null for "none";
   * leave undefined when unknown and the sheet fetches the latest weigh-in
   * itself (e.g. Home's quick log).
   */
  defaultWeightLb?: number | null;
}

/** Convert a stored pound value into the user's chosen unit for the input field. */
function lbToInput(lb: number | null | undefined, unit: 'lb' | 'kg'): string {
  if (lb == null || lb <= 0) return '';
  const v = unit === 'kg' ? lbToKg(lb) : lb;
  return String(Math.round(v * 10) / 10);
}

export default function LogWeightSheet({
  visible,
  onClose,
  onLogged,
  defaultWeightLb,
}: LogWeightSheetProps) {
  const { colors } = useTheme();
  const { weightUnit } = useUserPreferences();
  const [value, setValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset the field each time the sheet opens. When the caller doesn't know
  // the last weigh-in, fetch it for the prefill — but never overwrite
  // something the user has already typed.
  useEffect(() => {
    if (!visible) return;
    setValue(lbToInput(defaultWeightLb ?? null, weightUnit));
    setError(null);
    setSubmitting(false);
    if (defaultWeightLb !== undefined) return;
    let active = true;
    listWeighIns(1)
      .then((rows) => {
        const lb = rows[0]?.weightLb;
        if (!active || lb == null) return;
        setValue((v) => (v === '' ? lbToInput(lb, weightUnit) : v));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [visible, defaultWeightLb, weightUnit]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          paddingHorizontal: spacing.xxl,
        },
        sheet: {
          // No backgroundColor here: GlassSurface owns the fill, either as the
          // system glass material or as the opaque fallback it passes through.
          borderRadius: radius.lg,
          padding: spacing.xl,
          borderWidth: glassAvailable ? 0 : 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        title: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text },
        subtitle: {
          fontSize: text.body,
          color: colors.textMuted,
          marginTop: spacing.xs,
          marginBottom: spacing.lg,
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.lg,
          backgroundColor: colors.background,
        },
        input: {
          flex: 1,
          fontSize: text.display,
          fontWeight: weight.bold,
          color: colors.text,
          paddingVertical: spacing.md,
        },
        unit: { fontSize: text.headline, fontWeight: weight.semibold, color: colors.textSecondary },
        error: { color: colors.error, fontSize: text.body, marginTop: spacing.md },
        actions: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginTop: spacing.xl,
          gap: spacing.xxl,
        },
        cancel: { fontSize: text.callout, fontWeight: weight.semibold, color: colors.textSecondary },
        save: { fontSize: text.callout, fontWeight: weight.bold, color: colors.primary },
      }),
    [colors],
  );

  const handleSave = async () => {
    if (submitting) return;
    const parsed = Number.parseFloat(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError('Enter a valid weight.');
      return;
    }
    const weightLb = weightUnit === 'kg' ? kgToLb(parsed) : parsed;
    if (weightLb < 1 || weightLb > 1500) {
      setError('That weight looks out of range.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const entry = await logWeighIn({
        weightLb: Math.round(weightLb * 10) / 10,
      });
      haptics.success();
      onLogged?.(entry);
      onClose();
    } catch (e) {
      console.warn('[LogWeightSheet] save failed:', e);
      setError('Could not save. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
        />
        <GlassSurface style={styles.sheet}>
          <Text style={styles.title}>Log your weight</Text>
          <Text style={styles.subtitle}>
            Recorded in {weightUnit === 'kg' ? 'kilograms' : 'pounds'}.
          </Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={setValue}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={() => void handleSave()}
              accessibilityLabel="Body weight"
            />
            <Text style={styles.unit}>{weightUnit}</Text>
          </View>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={styles.actions}>
            <TouchableOpacity onPress={onClose} disabled={submitting}>
              <Text style={styles.cancel}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => void handleSave()} disabled={submitting}>
              {submitting ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <Text style={styles.save}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </GlassSurface>
      </KeyboardAvoidingView>
    </Modal>
  );
}
