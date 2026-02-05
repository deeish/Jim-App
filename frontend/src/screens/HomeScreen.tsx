import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  Pressable,
  Platform,
  Share,
  ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../contexts/AuthContext';
import type { RootNavigatorParamList } from '../types/navigation';

type ProfileNavProp = NativeStackNavigationProp<RootNavigatorParamList, 'Profile'>;

export default function HomeScreen() {
  const navigation = useNavigation<ProfileNavProp>();
  const { colors } = useTheme();
  const { signOut } = useAuth();
  const [menuVisible, setMenuVisible] = useState(false);

  const openMenu = () => setMenuVisible(true);
  const closeMenu = () => setMenuVisible(false);

  const goToProfile = () => {
    closeMenu();
    const parent = navigation.getParent();
    (parent as any)?.navigate('Profile');
  };

  const goToHistory = () => {
    const tabNav = navigation.getParent() as any;
    if (tabNav?.navigate) {
      tabNav.navigate('Plan', { screen: 'History' });
    }
  };

  const onInviteFriend = async () => {
    closeMenu();
    try {
      await Share.share({
        message: 'Check out Jim – my workout companion app!',
        title: 'Invite to Jim',
        url: undefined, // optional: add your app store link later
      });
    } catch {
      // User cancelled or share failed; ignore
    }
  };

  const onSignOut = async () => {
    closeMenu();
    await signOut();
  };

  const themedStyles = useMemo(
    () => ({
      container: { backgroundColor: colors.background },
      title: { color: colors.text },
      subtitle: { color: colors.textSecondary },
      menuCard: {
        backgroundColor: colors.surface,
        borderColor: colors.border,
        shadowColor: colors.shadow,
      },
      menuItemLabel: { color: colors.text },
      menuItemLabelDisabled: { color: colors.textMuted },
      menuDivider: { backgroundColor: colors.border },
    }),
    [colors]
  );

  return (
    <SafeAreaView style={[styles.container, themedStyles.container]} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.title, themedStyles.title]}>Jim</Text>
          <Text style={[styles.subtitle, themedStyles.subtitle]}>Your workout companion</Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={openMenu}
          activeOpacity={0.7}
          accessibilityLabel="Profile menu"
        >
          <Ionicons
            name="person-circle-outline"
            size={32}
            color={colors.primary}
          />
        </TouchableOpacity>
      </View>

      <Modal
        visible={menuVisible}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        <Pressable style={[styles.menuBackdrop, { backgroundColor: colors.overlay }]} onPress={closeMenu}>
          <View style={styles.menuAnchor} />
          <Pressable style={[styles.menuCard, themedStyles.menuCard]} onPress={(e) => e.stopPropagation()}>
            <TouchableOpacity
              style={styles.menuItem}
              onPress={goToProfile}
              activeOpacity={0.7}
            >
              <Ionicons name="person-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>My profile</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <View style={[styles.menuDivider, themedStyles.menuDivider]} />
            <View style={[styles.menuItem, styles.menuItemDisabled]}>
              <Ionicons name="people-outline" size={22} color={colors.textMuted} />
              <Text style={[styles.menuItemLabelDisabled, themedStyles.menuItemLabelDisabled]}>Invite a friend</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
            <View style={[styles.menuDivider, themedStyles.menuDivider]} />
            <TouchableOpacity
              style={styles.menuItem}
              onPress={onSignOut}
              activeOpacity={0.7}
            >
              <Ionicons name="log-out-outline" size={22} color={colors.text} />
              <Text style={[styles.menuItemLabel, themedStyles.menuItemLabel]}>Sign out</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <View style={styles.content}>
        <TouchableOpacity
          style={[styles.historyCard, themedStyles.menuCard]}
          onPress={goToHistory}
          activeOpacity={0.8}
        >
          <Ionicons name="calendar-outline" size={28} color={colors.primary} />
          <View style={styles.historyCardText}>
            <Text style={[styles.historyCardTitle, themedStyles.title]}>Workout history</Text>
            <Text style={[styles.historyCardSubtitle, themedStyles.subtitle]}>
              View past workouts and logs by day
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.textMuted} />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const PROFILE_BUTTON_TOP = 24 + 16; // header paddingTop + approximate line height
const PROFILE_BUTTON_RIGHT = 24;
const MENU_WIDTH = 200;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
  },
  headerLeft: {},
  profileButton: {
    padding: 4,
    marginRight: -4,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 16,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
  },
  historyCardText: { flex: 1 },
  historyCardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  historyCardSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },
  menuBackdrop: {
    flex: 1,
    paddingTop: PROFILE_BUTTON_TOP + 36,
    paddingRight: PROFILE_BUTTON_RIGHT,
    alignItems: 'flex-end',
    ...(Platform.OS === 'web' ? { cursor: 'default' } : {}),
  } as ViewStyle,
  menuAnchor: {
    position: 'absolute',
    top: PROFILE_BUTTON_TOP,
    right: PROFILE_BUTTON_RIGHT,
    width: 40,
    height: 40,
  },
  menuCard: {
    width: MENU_WIDTH,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 12,
  },
  menuItemLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  menuItemDisabled: {
    opacity: 0.6,
  },
  menuItemLabelDisabled: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    marginLeft: 16,
  },
});
