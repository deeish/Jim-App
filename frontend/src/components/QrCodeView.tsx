import React, { useMemo } from 'react';
import { View } from 'react-native';
import { createQrMatrix, runLengthRow } from '../lib/qrMatrix';
import { palette } from '../theme/colors';

import { radius } from '../theme';
const QUIET_ZONE_MODULES = 4;

/**
 * QR code rendered as plain Views (run-length-collapsed rows) so it works on
 * native, Expo Go, and web with no extra dependencies. Always dark-on-white,
 * independent of the app theme, with the quiet zone the QR spec requires:
 * scannability beats aesthetics here.
 */
export default function QrCodeView({
  value,
  size,
}: {
  value: string;
  /** Total rendered width/height in px, including the white quiet zone. */
  size: number;
}) {
  const rows = useMemo(
    () => createQrMatrix(value).map(runLengthRow),
    [value],
  );
  const moduleCount = rows.length + QUIET_ZONE_MODULES * 2;
  const moduleSize = size / moduleCount;
  const quiet = moduleSize * QUIET_ZONE_MODULES;

  return (
    <View
      accessible
      accessibilityLabel="QR code for this share"
      style={{
        width: size,
        height: size,
        backgroundColor: '#FFFFFF',
        borderRadius: radius.md,
        padding: quiet,
        // The card is white by spec, and so is the sheet behind it — without this
        // hairline the QR appears to float with no edge.
        borderWidth: 1,
        borderColor: palette.border,
      }}
    >
      {rows.map((runs, rowIndex) => (
        <View
          key={rowIndex}
          style={{ flexDirection: 'row', height: moduleSize }}
        >
          {runs.map(([dark, length], runIndex) => (
            <View
              key={runIndex}
              style={{
                width: moduleSize * length,
                backgroundColor: dark ? '#000000' : 'transparent',
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}
