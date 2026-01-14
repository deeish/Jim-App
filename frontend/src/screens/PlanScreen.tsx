import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { colors } from '../theme/colors';

const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const weeks = ['Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6', 'Week 7', 'Week 8'];

// Placeholder workout data
const placeholderWorkouts: Record<string, Array<{ title: string; details: string; iconColor: string }>> = {
  Monday: [
    { title: 'Recovery Day', details: 'Rest and recovery', iconColor: '#9B59B6' },
  ],
  Tuesday: [
    { title: 'Interval Swim', details: 'MS: 4x 200m (1,600 total)', iconColor: '#3498DB' },
    { title: 'Easy Bike', details: '50 min.', iconColor: '#2ECC71' },
  ],
  Wednesday: [
    { title: 'Interval Run', details: '40 min. w/6 x 1 min. fast', iconColor: '#E67E22' },
  ],
  Thursday: [
    { title: 'Long Bike', details: '90 min. steady pace', iconColor: '#2ECC71' },
  ],
  Friday: [
    { title: 'Easy Swim', details: '30 min. technique focus', iconColor: '#3498DB' },
  ],
  Saturday: [
    { title: 'Long Run', details: '60 min. easy pace', iconColor: '#E67E22' },
  ],
  Sunday: [
    { title: 'Rest Day', details: 'Complete rest', iconColor: '#95A5A6' },
  ],
};

export default function PlanScreen() {
  const [selectedWeek, setSelectedWeek] = useState(0);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Weekly Sprint</Text>
      </View>

      {/* Week Tabs */}
      <View style={styles.weekTabsContainer}>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.weekTabsContent}
        >
          {weeks.map((week, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.weekTab,
                selectedWeek === index && styles.weekTabActive
              ]}
              onPress={() => setSelectedWeek(index)}
            >
              <Text style={[
                styles.weekTabText,
                selectedWeek === index && styles.weekTabTextActive
              ]}>
                {week}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Days List */}
      <ScrollView 
        style={styles.content} 
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {daysOfWeek.map((day) => {
          const workouts = placeholderWorkouts[day] || [];
          return (
            <View key={day} style={styles.daySection}>
              <Text style={styles.dayTitle}>{day}</Text>
              {workouts.map((workout, index) => (
                <View key={index} style={styles.workoutCard}>
                  <View style={[styles.workoutIcon, { backgroundColor: workout.iconColor }]}>
                    <View style={styles.iconPlaceholder} />
                  </View>
                  <View style={styles.workoutContent}>
                    <Text style={styles.workoutTitle}>{workout.title}</Text>
                    <Text style={styles.workoutDetails}>{workout.details}</Text>
                  </View>
                  <TouchableOpacity>
                    <Text style={styles.seeMore}>See More &gt;</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.surface,
    padding: 16,
    paddingTop: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
  },
  weekTabsContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    height: 56, // Fixed height to prevent expansion
    maxHeight: 56, // Ensure it doesn't grow
  },
  weekTabsContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    alignItems: 'center', // Center items vertically
    gap: 8,
  },
  weekTab: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.surface,
    marginRight: 8,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
    height: 32, // Fixed height for tabs
  },
  weekTabActive: {
    backgroundColor: colors.primary,
  },
  weekTabText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    lineHeight: 14,
  },
  weekTabTextActive: {
    color: colors.background,
  },
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
  },
  daySection: {
    marginBottom: 24,
  },
  dayTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
    marginBottom: 12,
  },
  workoutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  workoutIcon: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconPlaceholder: {
    width: 30,
    height: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 4,
  },
  workoutContent: {
    flex: 1,
  },
  workoutTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  workoutDetails: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  seeMore: {
    fontSize: 14,
    color: colors.primary,
    fontWeight: '500',
  },
});
