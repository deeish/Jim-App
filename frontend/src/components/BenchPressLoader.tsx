import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import type { ColorPalette } from '../theme/colors';

/**
 * Renders the animated Skia bench-press silhouette with the defensive guards the
 * app uses around native Skia: a guarded require (so Expo Go, which has no native
 * Skia, degrades to a spinner instead of throwing at import) plus an error boundary
 * (so a render-time Skia failure degrades instead of white-screening). Used as the
 * visual for the "generating your plan" wait on `PlanPreviewScreen`.
 */
const BenchPressSilhouette = ((): React.ComponentType<{
  size?: number;
  colors: ColorPalette;
}> | null => {
  try {
    return require('./BenchPressSilhouette').default;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[BenchPressLoader] native Skia unavailable; using spinner fallback.', e);
    return null;
  }
})();

/**
 * Second safety net: if Skia loaded but throws while rendering, degrade to the
 * spinner rather than taking down the screen mid-generation.
 */
class SkiaBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    // eslint-disable-next-line no-console
    console.warn('[BenchPressLoader] Skia silhouette failed; using spinner fallback.', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function BenchPressLoader({
  size = 200,
  colors,
}: {
  size?: number;
  colors: ColorPalette;
}) {
  const spinner = <ActivityIndicator size="large" color={colors.primary} />;
  return (
    <View style={styles.art}>
      {BenchPressSilhouette ? (
        <SkiaBoundary fallback={spinner}>
          <BenchPressSilhouette size={size} colors={colors} />
        </SkiaBoundary>
      ) : (
        spinner
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  art: { alignItems: 'center', justifyContent: 'center' },
});
