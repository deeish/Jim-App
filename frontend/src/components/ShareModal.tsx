import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Button from './Button';
import QrCodeView from './QrCodeView';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import { useUserPreferences } from '../contexts/UserPreferencesContext';
import { createShare, type ShareKind } from '../services/shareService';
import { formatShareCode } from '../lib/shareCode';
import { buildShareMessage, buildShareUrl } from '../lib/shareLinks';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  kind: ShareKind;
  targetId: string;
  targetName: string;
}

/**
 * Bottom sheet showing the QR code + short code for sharing a plan or workout
 * with a gym buddy. The buddy scans the QR with their phone camera or types
 * the code into Profile > Redeem a share code.
 */
export default function ShareModal({
  visible,
  onClose,
  kind,
  targetId,
  targetName,
}: ShareModalProps) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { profileDisplayName } = useUserPreferences();

  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Same fallback chain the Profile screen uses for the account name; the
  // backend never has a display name of its own.
  const senderName = useMemo(() => {
    if (profileDisplayName.trim()) return profileDisplayName.trim();
    const meta = user?.user_metadata as Record<string, unknown> | undefined;
    const full = meta?.full_name ?? meta?.name;
    if (typeof full === 'string' && full.trim()) return full.trim();
    const email = user?.email;
    if (email && email.includes('@')) return email.split('@')[0];
    return undefined;
  }, [profileDisplayName, user]);

  const fetchCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createShare({ kind, targetId, senderName });
      setCode(result.code);
    } catch (err) {
      const e = err as { response?: { data?: { message?: string } }; message?: string };
      setError(e.response?.data?.message ?? e.message ?? 'Could not create a share code.');
    } finally {
      setLoading(false);
    }
  }, [kind, targetId, senderName]);

  useEffect(() => {
    if (!visible) return;
    setCode(null);
    void fetchCode();
    // Refetch on every open so a different target gets its own code.
  }, [visible, fetchCode]);

  const handleShare = async () => {
    if (!code) return;
    try {
      await Share.share({
        message: buildShareMessage({ kind, name: targetName, code }),
      });
    } catch {
      // Share sheet unavailable (e.g. some web browsers) or dismissed; the QR
      // and code stay on screen, so there is nothing to recover from.
    }
  };

  const styles = useMemo(
    () =>
      StyleSheet.create({
        overlay: {
          flex: 1,
          backgroundColor: colors.overlay,
          justifyContent: 'flex-end',
        },
        container: {
          backgroundColor: colors.surface,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          paddingBottom: 28,
        },
        header: {
          padding: 20,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
        },
        title: {
          fontSize: 20,
          fontWeight: 'bold',
          color: colors.text,
          flex: 1,
        },
        closeButton: {
          padding: 8,
        },
        closeText: {
          fontSize: 22,
          color: colors.textTertiary,
        },
        body: {
          alignItems: 'center',
          paddingHorizontal: 24,
          paddingTop: 24,
          gap: 16,
        },
        codeText: {
          fontSize: 32,
          fontWeight: 'bold',
          letterSpacing: 2,
          color: colors.text,
          fontVariant: ['tabular-nums'],
        },
        caption: {
          fontSize: 14,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 20,
        },
        expiry: {
          fontSize: 12,
          color: colors.textTertiary,
        },
        errorText: {
          fontSize: 15,
          color: colors.text,
          textAlign: 'center',
          lineHeight: 21,
        },
        footer: {
          paddingHorizontal: 24,
          paddingTop: 20,
        },
        footerButton: {
          minHeight: 48,
        },
        loadingBox: {
          height: 260,
          justifyContent: 'center',
        },
      }),
    [colors],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title} numberOfLines={1}>
              {kind === 'plan' ? 'Share this plan' : 'Share this workout'}
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              accessibilityLabel="Close share sheet"
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={[styles.body, styles.loadingBox]}>
              <ActivityIndicator size="large" color={colors.primary} />
            </View>
          ) : error ? (
            <View style={styles.body}>
              <Text style={styles.errorText}>{error}</Text>
              <View style={styles.footer}>
                <Button
                  title="Try again"
                  onPress={() => void fetchCode()}
                  style={styles.footerButton}
                />
              </View>
            </View>
          ) : code ? (
            <>
              <View style={styles.body}>
                <QrCodeView value={buildShareUrl(code)} size={220} />
                <Text
                  style={styles.codeText}
                  accessibilityLabel={`Share code ${formatShareCode(code)}`}
                >
                  {formatShareCode(code)}
                </Text>
                <Text style={styles.caption}>
                  Have your gym buddy scan this with their phone camera, or
                  enter the code in Jim under Profile.
                </Text>
                <Text style={styles.expiry}>Code works for 30 days.</Text>
              </View>
              <View style={styles.footer}>
                <Button
                  title="Share"
                  onPress={handleShare}
                  style={styles.footerButton}
                />
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
