import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors } from '../theme/colors';
import { ProfileIcon } from '../components/TabIcons';
import { RootNavigatorParamList } from '../../App';

type ProfileNavProp = NativeStackNavigationProp<RootNavigatorParamList, 'Profile'>;

export default function HomeScreen() {
  const navigation = useNavigation<ProfileNavProp>();

  const onProfilePress = () => {
    const parent = navigation.getParent();
    (parent as any)?.navigate('Profile');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Jim</Text>
          <Text style={styles.subtitle}>Your workout companion</Text>
        </View>
        <TouchableOpacity
          style={styles.profileButton}
          onPress={onProfilePress}
          activeOpacity={0.7}
          accessibilityLabel="Profile"
        >
          <ProfileIcon color={colors.text} ringColor={colors.primary} size={28} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Add your home features here */}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
    padding: 8,
    marginRight: -8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
});
