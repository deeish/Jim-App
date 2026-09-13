import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { useTheme } from '../theme';
import { DASH_BASE, JIM_MARK, dashArrayFor, type SegmentCount } from '../lib/jimMark';

type Props = {
  /** Rendered box, in points. The mark itself fills ~63% of it. */
  size?: number;
  /**
   * Segments lit, 0–5. Default 5: the identity is always the full mark. Fewer
   * is only ever a frame of motion (the tap-to-rep, the launch animation), never
   * a measure of anything: five is a property of the letter, not of a plan.
   */
  filled?: SegmentCount;
  /** Lit-segment colour. Defaults to the theme's brand token. */
  color?: string;
  /** Unlit-segment colour, only drawn when `filled` < 5. Defaults to the theme's track token. */
  trackColor?: string;
  style?: StyleProp<ViewStyle>;
  /** Omit to render as decoration (hidden from screen readers). */
  accessibilityLabel?: string;
};

/**
 * The Jim brand mark (brand/README.md): a five-segment J drawn as two copies of
 * one SVG path, an unlit track underneath and a lit run on top, so the only
 * thing that changes between states is a dash array. Plain react-native-svg —
 * no Skia, no gradients, and never rounded caps.
 */
export default function JimMark({
  size = 32,
  filled = 5,
  color,
  trackColor,
  style,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const lit = color ?? colors.brand;
  const track = trackColor ?? colors.brandTrack;
  const litDash = dashArrayFor(filled);

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      style={style}
      // Only real accessibility props reach the element: react-native-svg on web
      // forwards unknown/boolean RN props straight to the DOM <svg> and warns.
      {...(accessibilityLabel !== undefined
        ? { accessible: true, accessibilityRole: 'image' as const, accessibilityLabel }
        : { 'aria-hidden': true })}
    >
      <G transform={JIM_MARK.transform}>
        {filled < JIM_MARK.segments ? (
          <Path
            d={JIM_MARK.path}
            fill="none"
            stroke={track}
            strokeWidth={JIM_MARK.strokeWidth}
            strokeLinecap="butt"
            strokeDasharray={[...DASH_BASE]}
          />
        ) : null}
        {litDash ? (
          <Path
            d={JIM_MARK.path}
            fill="none"
            stroke={lit}
            strokeWidth={JIM_MARK.strokeWidth}
            strokeLinecap="butt"
            strokeDasharray={litDash}
          />
        ) : null}
      </G>
    </Svg>
  );
}
