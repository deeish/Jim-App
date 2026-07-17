import React, { useMemo } from 'react';
import { View } from 'react-native';
import { createQrMatrix, runLengthRow } from '../lib/qrMatrix';

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
        borderRadius: 12,
        padding: quiet,
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
