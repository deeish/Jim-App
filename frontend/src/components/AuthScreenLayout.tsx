import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme';
import JimLogo from './JimLogo';

type Props = {
  /** Form body — fields, hints, notices, primary action. */
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  /** Optional row pinned to the bottom of the screen (e.g. "Sign up" link). */
  footer?: React.ReactNode;
  /** Show the Jim brand lockup above the title. Defaults to true. */
  showBrand?: boolean;
  /** Renders a back affordance at the top. Keep nav-agnostic by passing the handler. */
  onBack?: () => void;
  backLabel?: string;
  contentStyle?: StyleProp<ViewStyle>;
};

/**
 * Shared shell for every auth screen: gradient wash, safe area, keyboard
 * avoidance, optional brand lockup, a centered title block, an entrance
 * animation, and a bottom-pinned footer. Screens supply only their form body
 * so the four auth screens stay visually identical.
 */
export default function AuthScreenLayout({
  children,
  title,
  subtitle,
  footer,
  showBrand = true,
  onBack,
  backLabel = 'Back',
  contentStyle,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={[`${colors.primary}22`, colors.background] as const}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboard}
        >
          <Animated.View
            entering={FadeInDown.duration(260)}
            style={[styles.content, contentStyle]}
          >
            {onBack ? (
              <TouchableOpacity
                style={styles.backLink}
                onPress={onBack}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityRole="button"
              >
                <Ionicons name="chevron-back" size={18} color={colors.primary} />
                <Text style={[styles.backText, { color: colors.primary }]}>{backLabel}</Text>
              </TouchableOpacity>
            ) : null}

            {showBrand ? (
              <View style={styles.brandWrap}>
                <JimLogo showTagline />
              </View>
            ) : null}

            <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
            {subtitle ? (
              <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>
            ) : null}

            <View style={styles.body}>{children}</View>

            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  keyboard: { flex: 1 },
  content: { flex: 1, paddingHorizontal: 24, paddingTop: 24 },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 12,
  },
  backText: { fontSize: 16, fontWeight: '600', marginLeft: 2 },
  brandWrap: { alignItems: 'center', marginTop: 8, marginBottom: 28 },
  title: { fontSize: 26, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  subtitle: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginBottom: 28 },
  body: {},
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 'auto',
    paddingTop: 24,
  },
});
