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
import { useTheme } from '../theme';
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
          paddingHorizontal: 24,
        },
        sheet: {
          backgroundColor: colors.surface,
          borderRadius: 18,
          padding: 22,
          borderWidth: 1,
          borderColor: colors.border,
        },
        title: { fontSize: 18, fontWeight: '700', color: colors.text },
        subtitle: {
          fontSize: 13,
          color: colors.textMuted,
          marginTop: 4,
          marginBottom: 16,
        },
        inputRow: {
          flexDirection: 'row',
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          paddingHorizontal: 14,
          backgroundColor: colors.background,
        },
        input: {
          flex: 1,
          fontSize: 28,
          fontWeight: '700',
          color: colors.text,
          paddingVertical: 12,
        },
        unit: { fontSize: 18, fontWeight: '600', color: colors.textSecondary },
        error: { color: colors.error, fontSize: 13, marginTop: 10 },
        actions: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          marginTop: 20,
          gap: 24,
        },
        cancel: { fontSize: 16, fontWeight: '600', color: colors.textSecondary },
        save: { fontSize: 16, fontWeight: '700', color: colors.primary },
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
          onPress={onClose}
        />
        <View style={styles.sheet}>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
