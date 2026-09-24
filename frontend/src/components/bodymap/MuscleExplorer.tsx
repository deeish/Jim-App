import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { getMuscleGroupVisual } from '../../constants/muscleGroupMeta';
import { haptics } from '../../lib/haptics';
import { describeHeat, heatAlphaByRegion, heatByMuscle, hexWithAlpha, MuscleHeat } from '../../lib/muscleHeat';
import { getMuscleHeat } from '../../services/workoutService';
import { duration, easing, radius, spacing, text, useTheme, weight } from '../../theme';
import { BODY_MAP_REGIONS, BodyMapView } from './bodyMapPaths';
import { primaryRegionFor } from './bodyMapRegions';
import {
  BODY_MAP_PLAIN_NAMES,
  BodyMapRegionDescription,
  describeRegion,
  siblingRegionKeys,
} from './bodyMapNames';
import {
  composeCamera,
  ExplorerCamera,
  fitMetrics,
  frameBounds,
  IDENTITY_CAMERA,
  isZoomed,
  pixelToViewbox,
  viewboxToLocal,
  visibleWindow,
} from './muscleExplorerCamera';
import MuscleExplorerFigure from './MuscleExplorerFigure';
import type { HitTester } from './muscleExplorerFigureProps';

/**
 * The Muscles section of the Exercises tab: the full anatomy figure with
 * pinch/pan zoom and tap-to-name. Tap a muscle and the camera frames it in the
 * part of the stage the readout sheet leaves uncovered; the sheet names it
 * (plain name first, anatomical under), lists the other heads of the same
 * muscle, and offers the exercises that train it. Tapping the same muscle
 * again, or the body outside any muscle, zooms back out.
 *
 * Gestures and the camera live on the UI thread (Reanimated shared values);
 * React only renders on selection changes. Platform renderers draw the figure
 * and answer hit-tests: MuscleExplorerFigure.tsx (Skia) / .web.tsx (svg).
 */

const FRAME_MS = 340;
/** Sheet height before its first layout, so the first framing is close enough. */
const SHEET_ESTIMATE_PX = 150;
/** Sibling heads wear the hue at ~38% alpha (8-digit hex). */
const SIBLING_ALPHA = '61';
/** "This week" window the trained layer asks the backend for. */
const HEAT_DAYS = 7;

type Layer = 'explore' | 'trained';
type HeatStatus = 'idle' | 'loading' | 'ready' | 'error';

type Props = {
  /** "Exercises for Quads": the host applies the filter and switches to the list. */
  onExercises: (region: BodyMapRegionDescription) => void;
  /** Space the floating tab bar covers at the bottom of the pane. */
  bottomInset: number;
  initialView?: BodyMapView;
  /**
   * Open already framed on this muscle (a catalog sub-muscle like "Quads" or a
   * region key). Used by the exercise page's tap-through. Read once, at mount.
   */
  initialSelection?: string;
};

export default function MuscleExplorer({ onExercises, bottomInset, initialView = 'front', initialSelection }: Props) {
  const { colors } = useTheme();
  // Resolved once: the view holding the muscle wins over initialView.
  const [initialTarget] = useState(() => (initialSelection ? primaryRegionFor(initialSelection) : null));
  const initialTargetDone = useRef(false);
  const [view, setView] = useState<BodyMapView>(initialTarget?.view ?? initialView);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [zoomed, setZoomed] = useState(false);
  const [everSelected, setEverSelected] = useState(false);
  // "Trained this week" layer: fetched the first time it is switched on.
  const [layer, setLayer] = useState<Layer>('explore');
  const [heat, setHeat] = useState<MuscleHeat | null>(null);
  const [heatStatus, setHeatStatus] = useState<HeatStatus>('idle');
  // One request per mount, started the first time the layer is switched on.
  // A response that lands after the layer was switched off is still kept
  // (the component is alive; switching back must not refetch). Only unmount
  // drops it.
  const heatRequested = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (layer !== 'trained' || heatRequested.current) return;
    heatRequested.current = true;
    setHeatStatus('loading');
    getMuscleHeat(HEAT_DAYS)
      .then((data) => {
        if (!mounted.current) return;
        setHeat(data);
        setHeatStatus('ready');
      })
      .catch(() => {
        if (!mounted.current) return;
        // Allow a retry on the next switch-on.
        heatRequested.current = false;
        setHeatStatus('error');
      });
  }, [layer]);
  const heatEntries = useMemo(() => heatByMuscle(heat), [heat]);
  const sheetHeightRef = useRef(SHEET_ESTIMATE_PX);
  // The sheet keeps its last content while sliding out (no blank card mid-slide),
  // which also means its measured height is the real one from the first open on.
  const lastDescriptionRef = useRef<BodyMapRegionDescription | null>(null);
  const sheetMeasuredWithContent = useRef(false);
  const hitRef = useRef<HitTester | null>(null);

  const fit = useMemo(() => fitMetrics(stage.width || 1, stage.height || 1), [stage.width, stage.height]);
  const fitSV = useSharedValue(fit);
  useEffect(() => {
    fitSV.value = fit;
  }, [fit, fitSV]);

  // Committed camera (animated by taps) + in-flight gesture deltas.
  const baseS = useSharedValue(1);
  const baseTX = useSharedValue(0);
  const baseTY = useSharedValue(0);
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const panOffX = useSharedValue(0);
  const panOffY = useSharedValue(0);
  const pinchScale = useSharedValue(1);
  const pinchOff = useSharedValue(1);
  const focalX = useSharedValue(100);
  const focalY = useSharedValue(220);

  const camera = useDerivedValue<ExplorerCamera>(() =>
    composeCamera(
      { s: baseS.value, tx: baseTX.value, ty: baseTY.value },
      { x: panX.value, y: panY.value, offX: panOffX.value, offY: panOffY.value },
      { scale: pinchScale.value, offScale: pinchOff.value, focal: { x: focalX.value, y: focalY.value } },
      fitSV.value,
    ),
  );

  useAnimatedReaction(
    () => isZoomed(camera.value),
    (next, prev) => {
      if (next !== prev) runOnJS(setZoomed)(next);
    },
  );

  const animateTo = useCallback(
    (c: ExplorerCamera) => {
      const cfg = { duration: FRAME_MS, easing: Easing.bezier(...easing.standard) };
      baseS.value = withTiming(c.s, cfg);
      baseTX.value = withTiming(c.tx, cfg);
      baseTY.value = withTiming(c.ty, cfg);
    },
    [baseS, baseTX, baseTY],
  );

  const frameRegion = useCallback(
    (key: string) => {
      const region = BODY_MAP_REGIONS[view][key];
      if (!region) return;
      // Before the sheet has ever held content its layout height is just the
      // grab handle, so the first framing uses the estimate instead.
      const covered = sheetMeasuredWithContent.current
        ? sheetHeightRef.current
        : Math.max(sheetHeightRef.current, SHEET_ESTIMATE_PX);
      const win = visibleWindow(stage.height, fit, covered);
      animateTo(frameBounds(region.bounds, win));
    },
    [view, stage.height, fit, animateTo],
  );

  const select = useCallback(
    (key: string | null) => {
      setSelectedKey(key);
      if (key) {
        setEverSelected(true);
        haptics.select();
        frameRegion(key);
      } else {
        animateTo(IDENTITY_CAMERA);
      }
    },
    [frameRegion, animateTo],
  );

  // Tap-through from an exercise page: once the stage has a size (framing needs
  // it), select the requested muscle exactly as a tap would.
  useEffect(() => {
    if (!initialTarget || initialTargetDone.current || stage.height === 0) return;
    initialTargetDone.current = true;
    select(initialTarget.key);
  }, [initialTarget, stage.height, select]);

  const handleTap = useCallback(
    (x: number, y: number) => {
      const key = hitRef.current ? hitRef.current(x, y) : null;
      if (!key || key === selectedKey) select(null);
      else select(key);
    },
    [selectedKey, select],
  );

  const gesture = useMemo(() => {
    const commit = () => {
      'worklet';
      const c = camera.value;
      baseS.value = c.s;
      baseTX.value = c.tx;
      baseTY.value = c.ty;
    };
    const pan = Gesture.Pan()
      .minPointers(1)
      .maxPointers(2)
      .onUpdate((e) => {
        panX.value = e.translationX;
        panY.value = e.translationY;
      })
      .onEnd(() => {
        commit();
        panX.value = 0;
        panY.value = 0;
        panOffX.value = 0;
        panOffY.value = 0;
        pinchOff.value = pinchScale.value;
      });
    const pinch = Gesture.Pinch()
      .onBegin((e) => {
        const v = pixelToViewbox(e.focalX, e.focalY, fitSV.value);
        focalX.value = v.x;
        focalY.value = v.y;
      })
      .onUpdate((e) => {
        pinchScale.value = e.scale;
      })
      .onEnd(() => {
        commit();
        pinchScale.value = 1;
        pinchOff.value = 1;
        panOffX.value = panX.value;
        panOffY.value = panY.value;
      });
    const tap = Gesture.Tap()
      .maxDuration(300)
      .maxDistance(12)
      .onEnd((e, success) => {
        if (!success) return;
        const local = viewboxToLocal(camera.value, pixelToViewbox(e.x, e.y, fitSV.value));
        runOnJS(handleTap)(local.x, local.y);
      });
    return Gesture.Race(tap, Gesture.Simultaneous(pan, pinch));
  }, [camera, baseS, baseTX, baseTY, panX, panY, panOffX, panOffY, pinchScale, pinchOff, focalX, focalY, fitSV, handleTap]);

  const switchView = useCallback(
    (next: BodyMapView) => {
      if (next === view) return;
      setView(next);
      setSelectedKey(null);
      animateTo(IDENTITY_CAMERA);
    },
    [view, animateTo],
  );

  const description = selectedKey ? describeRegion(view, selectedKey) : null;
  if (description) lastDescriptionRef.current = description;
  /** What the sheet shows: the live selection, or the last one while it slides away. */
  const shown = description ?? lastDescriptionRef.current;
  // Sibling lookup is by the current view; a stale description from the other
  // view (after a Front/Back switch) simply yields none while it slides away.
  const shownSiblings = useMemo(() => (shown ? siblingRegionKeys(view, shown.key) : []), [view, shown]);
  const siblings = useMemo(() => (selectedKey ? siblingRegionKeys(view, selectedKey) : []), [view, selectedKey]);
  const hue = description ? getMuscleGroupVisual(description.group).color : colors.bodyMapAssist;
  const shownHue = shown ? getMuscleGroupVisual(shown.group).color : hue;

  const fills = useMemo(() => {
    const out: Record<string, string> = {};
    const regions = BODY_MAP_REGIONS[view];
    if (layer === 'trained') {
      // Every region wears its own group hue at the strength it was trained;
      // the selected one goes solid so the tap still reads.
      const alpha = heatAlphaByRegion(view, heat);
      for (const [key, region] of Object.entries(regions)) {
        const groupHue = getMuscleGroupVisual(region.group).color;
        out[key] = key === selectedKey ? groupHue : alpha[key] > 0 ? hexWithAlpha(groupHue, alpha[key]) : colors.bodyMapQuiet;
      }
      return out;
    }
    const sibs = new Set(siblings);
    for (const key of Object.keys(regions)) {
      out[key] = key === selectedKey ? hue : sibs.has(key) ? hue + SIBLING_ALPHA : colors.bodyMapQuiet;
    }
    return out;
  }, [view, layer, heat, selectedKey, siblings, hue, colors.bodyMapQuiet]);

  const heatCaption = useMemo(() => {
    if (layer !== 'trained') return null;
    if (heatStatus === 'loading' || heatStatus === 'idle') return 'Loading your week…';
    if (heatStatus === 'error') return "Couldn't load your week. Try again later.";
    if (!heat || heat.muscles.length === 0) return `Nothing logged in the last ${HEAT_DAYS} days`;
    return null;
  }, [layer, heatStatus, heat]);

  // Readout sheet slides in from below; its measured height feeds the framing.
  const sheetY = useSharedValue(400);
  const sheetOpen = !!description;
  useEffect(() => {
    const curve = sheetOpen ? easing.standard : easing.exit;
    sheetY.value = withTiming(sheetOpen ? 0 : sheetHeightRef.current + 40, {
      duration: duration.base,
      easing: Easing.bezier(curve[0], curve[1], curve[2], curve[3]),
    });
  }, [sheetOpen, sheetY]);
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }));
  const onSheetLayout = useCallback((e: LayoutChangeEvent) => {
    sheetHeightRef.current = e.nativeEvent.layout.height;
    if (lastDescriptionRef.current) sheetMeasuredWithContent.current = true;
  }, []);

  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setStage((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));
  }, []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bodyMapTileBg },
        passThrough: { pointerEvents: 'none' },
        stage: { flex: 1, overflow: 'hidden' },
        controls: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: spacing.lg,
          paddingTop: spacing.sm,
          paddingBottom: spacing.xs,
        },
        sideSeg: {
          flexDirection: 'row',
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          backgroundColor: colors.background,
        },
        sideBtn: { paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.md },
        sideBtnActive: { backgroundColor: colors.primary },
        sideText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.textSecondary },
        sideTextActive: { color: colors.onPrimary },
        resetSlot: { flex: 1, alignItems: 'center' },
        reset: {
          paddingVertical: spacing.xs + 2,
          paddingHorizontal: spacing.md,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        },
        resetText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.text },
        hint: {
          position: 'absolute',
          left: spacing.xl,
          right: spacing.xl,
          bottom: bottomInset + spacing.md,
          textAlign: 'center',
          fontSize: text.footnote,
          color: colors.textMuted,
        },
        sheet: {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.surface,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingTop: spacing.sm,
          paddingHorizontal: spacing.lg,
          paddingBottom: bottomInset + spacing.md,
          gap: spacing.sm,
          borderTopWidth: 1,
          borderColor: colors.border,
        },
        grab: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, backgroundColor: colors.border },
        head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        dot: { width: 11, height: 11, borderRadius: 6 },
        names: { flex: 1, minWidth: 0 },
        plain: { fontSize: text.headline, fontWeight: weight.bold, color: colors.text },
        anatomical: { fontSize: text.footnote, color: colors.textSecondary, fontStyle: 'italic', marginTop: 1 },
        heatLine: { fontSize: text.footnote, color: colors.textSecondary, marginTop: 2 },
        heatLineHot: { color: colors.text, fontWeight: weight.semibold },
        hintText: { fontStyle: 'normal', color: colors.textTertiary },
        groupPill: {
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm + 2,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        groupText: { fontSize: text.caption, fontWeight: weight.semibold, color: colors.textSecondary },
        foot: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
        sibs: { flex: 1, minWidth: 0 },
        sibsContent: { gap: spacing.xs + 2, paddingRight: spacing.xs },
        chip: {
          paddingVertical: spacing.xs + 1,
          paddingHorizontal: spacing.sm + 2,
          borderRadius: radius.pill,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.background,
        },
        chipText: { fontSize: text.footnote, fontWeight: weight.semibold, color: colors.text },
        // Compact on purpose: it shares the peek row with the sibling chips.
        exercisesBtn: {
          paddingVertical: spacing.sm + 1,
          paddingHorizontal: spacing.lg,
          borderRadius: radius.md,
          backgroundColor: colors.primary,
          flexShrink: 0,
        },
        exercisesBtnDisabled: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border },
        exercisesBtnPressed: { opacity: 0.85 },
        exercisesText: { fontSize: text.body, fontWeight: weight.semibold, color: colors.onPrimary },
        exercisesTextDisabled: { color: colors.textMuted },
      }),
    [colors, bottomInset],
  );

  const showHint = layer === 'explore' && !everSelected && !zoomed;
  const shownHeat = shown && shown.sub ? heatEntries.get(shown.sub) : undefined;

  return (
    <View style={styles.root}>
      {/* Front / Back on the left, the layer on the right; the page header stays the host's. */}
      <View style={styles.controls}>
        <View style={styles.sideSeg} accessibilityRole="tablist">
          {(['front', 'back'] as BodyMapView[]).map((v) => (
            <Pressable
              key={v}
              onPress={() => switchView(v)}
              style={[styles.sideBtn, view === v && styles.sideBtnActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: view === v }}
            >
              <Text style={[styles.sideText, view === v && styles.sideTextActive]}>
                {v === 'front' ? 'Front' : 'Back'}
              </Text>
            </Pressable>
          ))}
        </View>
        {/* Reset lives between the two switches so it never covers either. */}
        <View style={styles.resetSlot}>
          {zoomed && (
            <Pressable onPress={() => select(null)} style={styles.reset} accessibilityRole="button">
              <Text style={styles.resetText}>Reset</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.sideSeg} accessibilityRole="tablist">
          {(
            [
              ['explore', 'Explore'],
              ['trained', 'This week'],
            ] as [Layer, string][]
          ).map(([l, label]) => (
            <Pressable
              key={l}
              onPress={() => setLayer(l)}
              style={[styles.sideBtn, layer === l && styles.sideBtnActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: layer === l }}
            >
              <Text style={[styles.sideText, layer === l && styles.sideTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <GestureDetector gesture={gesture}>
        <Animated.View style={styles.stage} onLayout={onStageLayout} collapsable={false}>
          {stage.width > 0 && stage.height > 0 && (
            <MuscleExplorerFigure
              view={view}
              width={stage.width}
              height={stage.height}
              fit={fit}
              camera={camera}
              fills={fills}
              selectedKey={selectedKey}
              strokeColor={colors.text}
              bodyColor={colors.bodyMapBody}
              bodyColorShade={colors.bodyMapBodyShade}
              outlineColor={colors.bodyMapOutline}
              hitRef={hitRef}
            />
          )}
        </Animated.View>
      </GestureDetector>

      {showHint && (
        <Text style={[styles.hint, styles.passThrough]}>
          Tap a muscle to see what it's called and the exercises that train it
        </Text>
      )}
      {heatCaption && !sheetOpen && (
        <Text style={[styles.hint, styles.passThrough]}>{heatCaption}</Text>
      )}

      <Animated.View
        style={[styles.sheet, sheetStyle, !sheetOpen && styles.passThrough]}
        onLayout={onSheetLayout}
        accessibilityElementsHidden={!sheetOpen}
        importantForAccessibility={sheetOpen ? 'auto' : 'no-hide-descendants'}
      >
        <View style={styles.grab} />
        {shown && (
          <>
            <View style={styles.head}>
              <View style={[styles.dot, { backgroundColor: shownHue }]} />
              <View style={styles.names}>
                <Text style={styles.plain} numberOfLines={1}>
                  {shown.plain}
                </Text>
                <Text style={styles.anatomical} numberOfLines={1}>
                  {shown.anatomical}
                  {shown.hint ? <Text style={styles.hintText}> · {shown.hint}</Text> : null}
                </Text>
                {layer === 'trained' && heatStatus === 'ready' && shown.sub && (
                  <Text style={[styles.heatLine, shownHeat && styles.heatLineHot]} numberOfLines={1}>
                    {describeHeat(shownHeat, heat?.days ?? HEAT_DAYS, new Date())}
                  </Text>
                )}
              </View>
              <View style={styles.groupPill}>
                <Text style={styles.groupText}>
                  {shown.sub ? `${shown.sub} · ${shown.groupLabel}` : `Detail only · ${shown.groupLabel}`}
                </Text>
              </View>
            </View>
            <View style={styles.foot}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.sibs}
                contentContainerStyle={styles.sibsContent}
                keyboardShouldPersistTaps="handled"
              >
                {shownSiblings.map((key) => (
                  <Pressable key={key} onPress={() => select(key)} style={styles.chip} accessibilityRole="button">
                    <Text style={styles.chipText}>{BODY_MAP_PLAIN_NAMES[key]?.plain ?? key}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable
                onPress={() => onExercises(shown)}
                disabled={!shown.sub}
                style={({ pressed }) => [
                  styles.exercisesBtn,
                  !shown.sub && styles.exercisesBtnDisabled,
                  pressed && styles.exercisesBtnPressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.exercisesText, !shown.sub && styles.exercisesTextDisabled]} numberOfLines={1}>
                  {shown.sub ? `Exercises for ${shown.sub}` : 'No exercises tagged yet'}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </Animated.View>
    </View>
  );
}
