/**
 * useTheme hook — manages theme selection and persistence via localStorage.
 *
 * Reads theme ID + custom colors from localStorage on mount,
 * calls applyTheme() to set canvas ThemeData + CSS custom properties.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  applyTheme,
  getDefaultCustomInput,
  type ThemeId,
  type CustomThemeInput,
} from '../renderer/theme';

const STORAGE_KEY_THEME = 'fusionCad_theme';
const STORAGE_KEY_CUSTOM = 'fusionCad_customTheme';

function loadThemeId(): ThemeId {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_THEME);
    if (stored) return stored as ThemeId;
  } catch { /* ignore */ }
  return 'professional';
}

function loadCustomColors(): CustomThemeInput {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM);
    if (stored) return JSON.parse(stored);
  } catch { /* ignore */ }
  return getDefaultCustomInput();
}

export function useTheme() {
  const [themeId, setThemeIdState] = useState<ThemeId>(loadThemeId);
  const [customColors, setCustomColorsState] = useState<CustomThemeInput>(loadCustomColors);

  // Apply theme on mount (before first render paints)
  useEffect(() => {
    applyTheme(themeId, themeId === 'custom' ? customColors : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setThemeId = useCallback((id: ThemeId) => {
    setThemeIdState(id);
    localStorage.setItem(STORAGE_KEY_THEME, id);
    applyTheme(id, id === 'custom' ? customColors : undefined);
  }, [customColors]);

  const setCustomColors = useCallback((colors: CustomThemeInput) => {
    setCustomColorsState(colors);
    localStorage.setItem(STORAGE_KEY_CUSTOM, JSON.stringify(colors));
    if (themeId === 'custom') {
      applyTheme('custom', colors);
    }
  }, [themeId]);

  return { themeId, setThemeId, customColors, setCustomColors };
}
