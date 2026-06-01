import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * DEV-ONLY. In-memory toggle that lets us jump into the onboarding flow from the
 * login screen without a real session. Nothing here is persisted, and the UI
 * that flips it is gated behind `__DEV__`, so it has no effect in production.
 * Safe to delete (this file + the button in LoginScreen + the branch in App.tsx)
 * once onboarding no longer needs previewing.
 */
type DevPreviewValue = {
  previewOnboarding: boolean;
  setPreviewOnboarding: (v: boolean) => void;
};

const DevPreviewContext = createContext<DevPreviewValue | null>(null);

export function DevPreviewProvider({ children }: { children: ReactNode }) {
  const [previewOnboarding, setPreviewOnboarding] = useState(false);
  const value = useMemo(
    () => ({ previewOnboarding, setPreviewOnboarding }),
    [previewOnboarding],
  );
  return <DevPreviewContext.Provider value={value}>{children}</DevPreviewContext.Provider>;
}

export function useDevPreview(): DevPreviewValue {
  const ctx = useContext(DevPreviewContext);
  if (!ctx) throw new Error('useDevPreview must be used within DevPreviewProvider');
  return ctx;
}
