/**
 * Multi-Theme System for fusionCad
 *
 * 5 preset themes + 1 custom theme with 8 user-facing color picks.
 * Canvas reads colors via getTheme(), CSS reads via var(--fc-*) custom properties.
 * Theme persisted in localStorage.
 */

// ---------------------------------------------------------------------------
// Canvas theme data (48 properties consumed by renderers)
// ---------------------------------------------------------------------------

export interface ThemeData {
  // Canvas background & grid
  canvasBg: string;
  gridDotColor: string;

  // Symbols
  symbolStroke: string;
  symbolStrokeWidth: number;
  symbolTextFill: string;

  // Pins
  pinDotColor: string;
  pinDotRadius: number;
  pinLabelColor: string;

  // Device tags
  tagColor: string;
  tagFont: string;

  // Wires
  wireWidth: number;
  wireWidthSelected: number;
  wireColors: string[];
  wireLabelBg: string;
  wireLabelFont: string;

  // Wire endpoints
  wireEndpointColor: string;
  wireEndpointRadius: number;
  wireEndpointSelectedColor: string;
  wireEndpointSelectedRadius: number;

  // Waypoint handles
  waypointFill: string;
  waypointStroke: string;
  waypointRadius: number;

  // Selection
  selectionColor: string;
  selectionWidth: number;
  selectionDash: number[];

  // Marquee
  marqueeWindowColor: string;
  marqueeWindowFill: string;
  marqueeCrossingColor: string;
  marqueeCrossingFill: string;

  // Wire preview / start highlight
  wireStartHighlight: string;
  wireStartFill: string;
  wirePreviewColor: string;

  // Dragging endpoint
  dragEndpointColor: string;

  // Annotations
  annotationColor: string;
  annotationSelectionColor: string;

  // Junction
  junctionFill: string;

  // Ladder diagram
  ladderRailLabelColor: string;
  ladderVoltageColor: string;
  ladderRungGuideColor: string;
  ladderRungNumberColor: string;
  ladderRungDescColor: string;

  // Title block
  titleBlockBg: string;
  titleBlockBorder: string;
  titleBlockDivider: string;
  titleBlockTitleColor: string;
  titleBlockFieldColor: string;
  titleBlockSheetColor: string;

  // UI accent
  accentColor: string;
}

// ---------------------------------------------------------------------------
// CSS custom properties applied to :root
// ---------------------------------------------------------------------------

export interface CSSThemeVars {
  '--fc-accent': string;
  '--fc-accent-bg': string;
  '--fc-accent-border': string;
  '--fc-bg-app': string;
  '--fc-bg-panel': string;
  '--fc-bg-hover': string;
  '--fc-bg-accent-tint': string;
  '--fc-bg-accent-hover': string;
  '--fc-border': string;
  '--fc-border-strong': string;
  '--fc-text-primary': string;
  '--fc-text-secondary': string;
  '--fc-text-muted': string;
  '--fc-text-dim': string;
  '--fc-danger': string;
  '--fc-symbol-stroke': string;
  '--fc-canvas-bg': string;
}

// ---------------------------------------------------------------------------
// Custom theme input (8 user-facing colors)
// ---------------------------------------------------------------------------

export interface CustomThemeInput {
  canvasBg: string;
  symbolColor: string;
  accentColor: string;
  panelBg: string;
  textColor: string;
  borderColor: string;
  wireBaseColor: string;
  gridBrightness: number; // 0-1
}

// ---------------------------------------------------------------------------
// Theme ID type
// ---------------------------------------------------------------------------

export type ThemeId = 'professional' | 'high-contrast' | 'blueprint' | 'classic' | 'light' | 'custom';

export const THEME_LIST: { id: ThemeId; name: string }[] = [
  { id: 'professional', name: 'Professional' },
  { id: 'high-contrast', name: 'High Contrast' },
  { id: 'blueprint', name: 'Blueprint' },
  { id: 'classic', name: 'Classic' },
  { id: 'light', name: 'Light' },
  { id: 'custom', name: 'Custom' },
];

// ---------------------------------------------------------------------------
// Helper: generate wire color palette from a base hue
// ---------------------------------------------------------------------------

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generateWireColors(baseHex: string): string[] {
  // Parse base color to get starting hue
  const r = parseInt(baseHex.slice(1, 3), 16) / 255;
  const g = parseInt(baseHex.slice(3, 5), 16) / 255;
  const b = parseInt(baseHex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
  }

  const colors: string[] = [];
  for (let i = 0; i < 11; i++) {
    const hue = (h + i * 33) % 360; // Spread across hue wheel
    colors.push(hslToHex(hue, 0.35, Math.max(0.35, Math.min(0.65, l))));
  }
  return colors;
}

// ---------------------------------------------------------------------------
// Helper: darken/lighten a hex color
// ---------------------------------------------------------------------------

function adjustBrightness(hex: string, factor: number): string {
  const r = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * factor)));
  const b = Math.min(255, Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * factor)));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---------------------------------------------------------------------------
// 5 Preset Themes
// ---------------------------------------------------------------------------

const PROFESSIONAL: ThemeData = {
  canvasBg: '#1e1e1e',
  gridDotColor: 'rgba(255, 255, 255, 0.08)',
  symbolStroke: '#c8c8c8',
  symbolStrokeWidth: 1.5,
  symbolTextFill: '#c8c8c8',
  pinDotColor: '#808080',
  pinDotRadius: 3,
  pinLabelColor: '#999999',
  tagColor: '#e0e0e0',
  tagFont: 'bold 12px monospace',
  wireWidth: 1.5,
  wireWidthSelected: 2,
  wireColors: ['#6B8EA0', '#7A9A6D', '#B07850', '#C4A24D', '#8B7EB8', '#5A9E9E', '#B06880', '#7AA3C8', '#9E8A6E', '#6EA87A', '#A8856E'],
  wireLabelBg: 'rgba(0, 0, 0, 0.75)',
  wireLabelFont: 'bold 10px monospace',
  wireEndpointColor: '#808080',
  wireEndpointRadius: 4,
  wireEndpointSelectedColor: '#5B9BD5',
  wireEndpointSelectedRadius: 7,
  waypointFill: '#cc6600',
  waypointStroke: '#ffffff',
  waypointRadius: 5,
  selectionColor: '#5B9BD5',
  selectionWidth: 1.5,
  selectionDash: [6, 3],
  marqueeWindowColor: '#5B9BD5',
  marqueeWindowFill: 'rgba(91, 155, 213, 0.1)',
  marqueeCrossingColor: '#7BC88F',
  marqueeCrossingFill: 'rgba(123, 200, 143, 0.1)',
  wireStartHighlight: '#cc6600',
  wireStartFill: 'rgba(204, 102, 0, 0.3)',
  wirePreviewColor: '#5B9BD5',
  dragEndpointColor: '#5B9BD5',
  annotationColor: '#e0e0e0',
  annotationSelectionColor: '#5B9BD5',
  junctionFill: '#c8c8c8',
  ladderRailLabelColor: '#ffffff',
  ladderVoltageColor: '#D4A84D',
  ladderRungGuideColor: 'rgba(255, 255, 255, 0.06)',
  ladderRungNumberColor: '#aaaaaa',
  ladderRungDescColor: '#888888',
  titleBlockBg: '#252525',
  titleBlockBorder: '#444',
  titleBlockDivider: '#555',
  titleBlockTitleColor: '#e0e0e0',
  titleBlockFieldColor: '#aaa',
  titleBlockSheetColor: '#888',
  accentColor: '#5B9BD5',
};

const HIGH_CONTRAST: ThemeData = {
  canvasBg: '#0a0a0a',
  gridDotColor: 'rgba(255, 255, 255, 0.15)',
  symbolStroke: '#ffffff',
  symbolStrokeWidth: 2,
  symbolTextFill: '#ffffff',
  pinDotColor: '#bbbbbb',
  pinDotRadius: 4,
  pinLabelColor: '#dddddd',
  tagColor: '#ffffff',
  tagFont: 'bold 13px monospace',
  wireWidth: 2,
  wireWidthSelected: 3,
  wireColors: ['#4FC3F7', '#81C784', '#FFB74D', '#FFD54F', '#CE93D8', '#4DD0E1', '#F48FB1', '#64B5F6', '#FFE082', '#A5D6A7', '#FFAB91'],
  wireLabelBg: 'rgba(0, 0, 0, 0.85)',
  wireLabelFont: 'bold 11px monospace',
  wireEndpointColor: '#bbbbbb',
  wireEndpointRadius: 5,
  wireEndpointSelectedColor: '#FFD700',
  wireEndpointSelectedRadius: 8,
  waypointFill: '#FF6600',
  waypointStroke: '#ffffff',
  waypointRadius: 6,
  selectionColor: '#FFD700',
  selectionWidth: 2,
  selectionDash: [8, 4],
  marqueeWindowColor: '#FFD700',
  marqueeWindowFill: 'rgba(255, 215, 0, 0.15)',
  marqueeCrossingColor: '#00FF88',
  marqueeCrossingFill: 'rgba(0, 255, 136, 0.15)',
  wireStartHighlight: '#FF6600',
  wireStartFill: 'rgba(255, 102, 0, 0.4)',
  wirePreviewColor: '#FFD700',
  dragEndpointColor: '#FFD700',
  annotationColor: '#ffffff',
  annotationSelectionColor: '#FFD700',
  junctionFill: '#ffffff',
  ladderRailLabelColor: '#ffffff',
  ladderVoltageColor: '#FFD700',
  ladderRungGuideColor: 'rgba(255, 255, 255, 0.12)',
  ladderRungNumberColor: '#dddddd',
  ladderRungDescColor: '#bbbbbb',
  titleBlockBg: '#111111',
  titleBlockBorder: '#666',
  titleBlockDivider: '#777',
  titleBlockTitleColor: '#ffffff',
  titleBlockFieldColor: '#dddddd',
  titleBlockSheetColor: '#bbbbbb',
  accentColor: '#FFD700',
};

const BLUEPRINT: ThemeData = {
  canvasBg: '#0D1B2A',
  gridDotColor: 'rgba(224, 213, 192, 0.06)',
  symbolStroke: '#E0D5C0',
  symbolStrokeWidth: 1.5,
  symbolTextFill: '#E0D5C0',
  pinDotColor: '#8A7E6B',
  pinDotRadius: 3,
  pinLabelColor: '#A09580',
  tagColor: '#E0D5C0',
  tagFont: 'bold 12px monospace',
  wireWidth: 1.5,
  wireWidthSelected: 2,
  wireColors: ['#7AA3C8', '#8FB88A', '#C49A6C', '#D4B84D', '#9B8EC8', '#6BB8B8', '#C07890', '#5A93B8', '#B09A7E', '#7EB88A', '#B8957E'],
  wireLabelBg: 'rgba(13, 27, 42, 0.85)',
  wireLabelFont: 'bold 10px monospace',
  wireEndpointColor: '#8A7E6B',
  wireEndpointRadius: 4,
  wireEndpointSelectedColor: '#7AA3C8',
  wireEndpointSelectedRadius: 7,
  waypointFill: '#C49A6C',
  waypointStroke: '#E0D5C0',
  waypointRadius: 5,
  selectionColor: '#7AA3C8',
  selectionWidth: 1.5,
  selectionDash: [6, 3],
  marqueeWindowColor: '#7AA3C8',
  marqueeWindowFill: 'rgba(122, 163, 200, 0.12)',
  marqueeCrossingColor: '#8FB88A',
  marqueeCrossingFill: 'rgba(143, 184, 138, 0.12)',
  wireStartHighlight: '#C49A6C',
  wireStartFill: 'rgba(196, 154, 108, 0.3)',
  wirePreviewColor: '#7AA3C8',
  dragEndpointColor: '#7AA3C8',
  annotationColor: '#E0D5C0',
  annotationSelectionColor: '#7AA3C8',
  junctionFill: '#E0D5C0',
  ladderRailLabelColor: '#E0D5C0',
  ladderVoltageColor: '#D4B84D',
  ladderRungGuideColor: 'rgba(224, 213, 192, 0.06)',
  ladderRungNumberColor: '#A09580',
  ladderRungDescColor: '#8A7E6B',
  titleBlockBg: '#122236',
  titleBlockBorder: '#2A4060',
  titleBlockDivider: '#3A5070',
  titleBlockTitleColor: '#E0D5C0',
  titleBlockFieldColor: '#A09580',
  titleBlockSheetColor: '#8A7E6B',
  accentColor: '#7AA3C8',
};

const CLASSIC: ThemeData = {
  canvasBg: '#000000',
  gridDotColor: 'rgba(0, 255, 0, 0.06)',
  symbolStroke: '#00ff00',
  symbolStrokeWidth: 1.5,
  symbolTextFill: '#00ff00',
  pinDotColor: '#008800',
  pinDotRadius: 3,
  pinLabelColor: '#00aa00',
  tagColor: '#00ff00',
  tagFont: 'bold 12px monospace',
  wireWidth: 1.5,
  wireWidthSelected: 2,
  wireColors: ['#00BFFF', '#00FF80', '#FF8000', '#FFFF00', '#FF00FF', '#00FFFF', '#FF4080', '#4080FF', '#80FF00', '#FF8080', '#80FFFF'],
  wireLabelBg: 'rgba(0, 0, 0, 0.85)',
  wireLabelFont: 'bold 10px monospace',
  wireEndpointColor: '#008800',
  wireEndpointRadius: 4,
  wireEndpointSelectedColor: '#00BFFF',
  wireEndpointSelectedRadius: 7,
  waypointFill: '#FF8000',
  waypointStroke: '#00ff00',
  waypointRadius: 5,
  selectionColor: '#00BFFF',
  selectionWidth: 1.5,
  selectionDash: [6, 3],
  marqueeWindowColor: '#00BFFF',
  marqueeWindowFill: 'rgba(0, 191, 255, 0.12)',
  marqueeCrossingColor: '#00FF80',
  marqueeCrossingFill: 'rgba(0, 255, 128, 0.12)',
  wireStartHighlight: '#FF8000',
  wireStartFill: 'rgba(255, 128, 0, 0.3)',
  wirePreviewColor: '#00BFFF',
  dragEndpointColor: '#00BFFF',
  annotationColor: '#00ff00',
  annotationSelectionColor: '#00BFFF',
  junctionFill: '#00ff00',
  ladderRailLabelColor: '#00ff00',
  ladderVoltageColor: '#FFFF00',
  ladderRungGuideColor: 'rgba(0, 255, 0, 0.06)',
  ladderRungNumberColor: '#00aa00',
  ladderRungDescColor: '#008800',
  titleBlockBg: '#0a0a0a',
  titleBlockBorder: '#004400',
  titleBlockDivider: '#006600',
  titleBlockTitleColor: '#00ff00',
  titleBlockFieldColor: '#00aa00',
  titleBlockSheetColor: '#008800',
  accentColor: '#00BFFF',
};

const LIGHT: ThemeData = {
  canvasBg: '#f5f5f5',
  gridDotColor: 'rgba(0, 0, 0, 0.08)',
  symbolStroke: '#333333',
  symbolStrokeWidth: 1.5,
  symbolTextFill: '#333333',
  pinDotColor: '#666666',
  pinDotRadius: 3,
  pinLabelColor: '#888888',
  tagColor: '#222222',
  tagFont: 'bold 12px monospace',
  wireWidth: 1.5,
  wireWidthSelected: 2,
  wireColors: ['#2070B0', '#3A8A3A', '#B06030', '#A08020', '#7060A0', '#207878', '#A04060', '#4080B0', '#806040', '#408050', '#905040'],
  wireLabelBg: 'rgba(255, 255, 255, 0.85)',
  wireLabelFont: 'bold 10px monospace',
  wireEndpointColor: '#666666',
  wireEndpointRadius: 4,
  wireEndpointSelectedColor: '#2070B0',
  wireEndpointSelectedRadius: 7,
  waypointFill: '#cc6600',
  waypointStroke: '#333333',
  waypointRadius: 5,
  selectionColor: '#2070B0',
  selectionWidth: 1.5,
  selectionDash: [6, 3],
  marqueeWindowColor: '#2070B0',
  marqueeWindowFill: 'rgba(32, 112, 176, 0.1)',
  marqueeCrossingColor: '#3A8A3A',
  marqueeCrossingFill: 'rgba(58, 138, 58, 0.1)',
  wireStartHighlight: '#cc6600',
  wireStartFill: 'rgba(204, 102, 0, 0.2)',
  wirePreviewColor: '#2070B0',
  dragEndpointColor: '#2070B0',
  annotationColor: '#222222',
  annotationSelectionColor: '#2070B0',
  junctionFill: '#333333',
  ladderRailLabelColor: '#222222',
  ladderVoltageColor: '#A08020',
  ladderRungGuideColor: 'rgba(0, 0, 0, 0.06)',
  ladderRungNumberColor: '#666666',
  ladderRungDescColor: '#888888',
  titleBlockBg: '#e8e8e8',
  titleBlockBorder: '#bbbbbb',
  titleBlockDivider: '#cccccc',
  titleBlockTitleColor: '#222222',
  titleBlockFieldColor: '#555555',
  titleBlockSheetColor: '#888888',
  accentColor: '#2070B0',
};

const PRESET_THEMES: Record<Exclude<ThemeId, 'custom'>, ThemeData> = {
  professional: PROFESSIONAL,
  'high-contrast': HIGH_CONTRAST,
  blueprint: BLUEPRINT,
  classic: CLASSIC,
  light: LIGHT,
};

// ---------------------------------------------------------------------------
// CSS vars derivation from ThemeData
// ---------------------------------------------------------------------------

function deriveCSSVars(theme: ThemeData, isLight: boolean): CSSThemeVars {
  const accent = theme.accentColor;
  return {
    '--fc-accent': accent,
    '--fc-accent-bg': hexToRgba(accent, 0.1),
    '--fc-accent-border': hexToRgba(accent, 0.25),
    '--fc-bg-app': isLight ? '#e8e8e8' : adjustBrightness(theme.canvasBg, 1.05),
    '--fc-bg-panel': isLight ? '#f0f0f0' : adjustBrightness(theme.canvasBg, 1.35),
    '--fc-bg-hover': isLight ? '#e0e0e0' : adjustBrightness(theme.canvasBg, 1.65),
    '--fc-bg-accent-tint': isLight ? hexToRgba(accent, 0.08) : hexToRgba(accent, 0.12),
    '--fc-bg-accent-hover': isLight ? hexToRgba(accent, 0.15) : hexToRgba(accent, 0.2),
    '--fc-border': isLight ? '#c0c0c0' : adjustBrightness(theme.canvasBg, 2.0),
    '--fc-border-strong': isLight ? '#aaaaaa' : adjustBrightness(theme.canvasBg, 2.6),
    '--fc-text-primary': theme.tagColor,
    '--fc-text-secondary': isLight ? '#555555' : adjustBrightness(theme.tagColor, 0.75),
    '--fc-text-muted': isLight ? '#888888' : adjustBrightness(theme.tagColor, 0.55),
    '--fc-text-dim': isLight ? '#aaaaaa' : adjustBrightness(theme.tagColor, 0.4),
    '--fc-danger': '#f44336',
    '--fc-symbol-stroke': theme.symbolStroke,
    '--fc-canvas-bg': theme.canvasBg,
  };
}

// ---------------------------------------------------------------------------
// Derive full theme from 8 custom inputs
// ---------------------------------------------------------------------------

export function deriveFullTheme(input: CustomThemeInput): { theme: ThemeData; css: CSSThemeVars } {
  const gridAlpha = Math.round(input.gridBrightness * 255 * 0.15);
  const isLight = isColorLight(input.canvasBg);

  const theme: ThemeData = {
    canvasBg: input.canvasBg,
    gridDotColor: `rgba(${isLight ? '0, 0, 0' : '255, 255, 255'}, ${(gridAlpha / 255).toFixed(2)})`,
    symbolStroke: input.symbolColor,
    symbolStrokeWidth: 1.5,
    symbolTextFill: input.symbolColor,
    pinDotColor: adjustBrightness(input.symbolColor, 0.6),
    pinDotRadius: 3,
    pinLabelColor: adjustBrightness(input.symbolColor, 0.7),
    tagColor: input.textColor,
    tagFont: 'bold 12px monospace',
    wireWidth: 1.5,
    wireWidthSelected: 2,
    wireColors: generateWireColors(input.wireBaseColor),
    wireLabelBg: hexToRgba(input.canvasBg, 0.8),
    wireLabelFont: 'bold 10px monospace',
    wireEndpointColor: adjustBrightness(input.symbolColor, 0.6),
    wireEndpointRadius: 4,
    wireEndpointSelectedColor: input.accentColor,
    wireEndpointSelectedRadius: 7,
    waypointFill: '#cc6600',
    waypointStroke: input.symbolColor,
    waypointRadius: 5,
    selectionColor: input.accentColor,
    selectionWidth: 1.5,
    selectionDash: [6, 3],
    marqueeWindowColor: input.accentColor,
    marqueeWindowFill: hexToRgba(input.accentColor, 0.1),
    marqueeCrossingColor: '#7BC88F',
    marqueeCrossingFill: 'rgba(123, 200, 143, 0.1)',
    wireStartHighlight: '#cc6600',
    wireStartFill: 'rgba(204, 102, 0, 0.3)',
    wirePreviewColor: input.accentColor,
    dragEndpointColor: input.accentColor,
    annotationColor: input.textColor,
    annotationSelectionColor: input.accentColor,
    junctionFill: input.symbolColor,
    ladderRailLabelColor: input.textColor,
    ladderVoltageColor: '#D4A84D',
    ladderRungGuideColor: `rgba(${isLight ? '0, 0, 0' : '255, 255, 255'}, 0.06)`,
    ladderRungNumberColor: adjustBrightness(input.textColor, 0.7),
    ladderRungDescColor: adjustBrightness(input.textColor, 0.55),
    titleBlockBg: adjustBrightness(input.canvasBg, isLight ? 0.95 : 1.2),
    titleBlockBorder: input.borderColor,
    titleBlockDivider: adjustBrightness(input.borderColor, 1.2),
    titleBlockTitleColor: input.textColor,
    titleBlockFieldColor: adjustBrightness(input.textColor, 0.7),
    titleBlockSheetColor: adjustBrightness(input.textColor, 0.55),
    accentColor: input.accentColor,
  };

  const css = deriveCSSVars(theme, isLight);
  // Override with direct user picks for panel/text/border
  css['--fc-bg-panel'] = input.panelBg;
  css['--fc-bg-app'] = adjustBrightness(input.panelBg, isLight ? 0.95 : 0.85);
  css['--fc-bg-hover'] = adjustBrightness(input.panelBg, isLight ? 0.92 : 1.2);
  css['--fc-border'] = input.borderColor;
  css['--fc-border-strong'] = adjustBrightness(input.borderColor, isLight ? 0.85 : 1.3);
  css['--fc-text-primary'] = input.textColor;
  css['--fc-text-secondary'] = adjustBrightness(input.textColor, isLight ? 1.3 : 0.75);
  css['--fc-text-muted'] = adjustBrightness(input.textColor, isLight ? 1.6 : 0.55);
  css['--fc-text-dim'] = adjustBrightness(input.textColor, isLight ? 2.0 : 0.4);

  return { theme, css };
}

function isColorLight(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ---------------------------------------------------------------------------
// Module-level state: current active theme
// ---------------------------------------------------------------------------

let currentTheme: ThemeData = PROFESSIONAL;

/** Get the current active theme (called at render time by canvas renderers) */
export function getTheme(): ThemeData {
  return currentTheme;
}

/** Set the current theme directly (low-level, prefer applyTheme) */
export function setTheme(theme: ThemeData): void {
  currentTheme = theme;
}

// ---------------------------------------------------------------------------
// Apply theme: sets canvas theme + writes CSS custom properties
// ---------------------------------------------------------------------------

function applyCSSVars(vars: CSSThemeVars): void {
  const root = document.documentElement.style;
  for (const [key, value] of Object.entries(vars)) {
    root.setProperty(key, value);
  }
}

/**
 * Apply a preset or custom theme.
 * - Sets module-level ThemeData (canvas renderers pick it up on next frame)
 * - Writes CSS custom properties to :root (UI picks them up immediately)
 */
export function applyTheme(themeId: ThemeId, customInput?: CustomThemeInput): void {
  if (themeId === 'custom' && customInput) {
    const { theme, css } = deriveFullTheme(customInput);
    currentTheme = theme;
    applyCSSVars(css);
  } else {
    const preset = PRESET_THEMES[themeId as Exclude<ThemeId, 'custom'>] || PROFESSIONAL;
    currentTheme = preset;
    const isLight = themeId === 'light';
    const css = deriveCSSVars(preset, isLight);
    applyCSSVars(css);
  }
}

/** Get the default custom theme input (based on Professional theme) */
export function getDefaultCustomInput(): CustomThemeInput {
  return {
    canvasBg: '#1e1e1e',
    symbolColor: '#c8c8c8',
    accentColor: '#5B9BD5',
    panelBg: '#2a2a2a',
    textColor: '#e0e0e0',
    borderColor: '#444444',
    wireBaseColor: '#6B8EA0',
    gridBrightness: 0.5,
  };
}

// ---------------------------------------------------------------------------
// Backward-compat named exports (deprecated — renderers should use getTheme())
// These are kept temporarily so that any code not yet migrated still compiles.
// ---------------------------------------------------------------------------

export const CANVAS_BG = PROFESSIONAL.canvasBg;
export const GRID_DOT_COLOR = PROFESSIONAL.gridDotColor;
export const SYMBOL_STROKE = PROFESSIONAL.symbolStroke;
export const SYMBOL_STROKE_WIDTH = PROFESSIONAL.symbolStrokeWidth;
export const SYMBOL_TEXT_FILL = PROFESSIONAL.symbolTextFill;
export const PIN_DOT_COLOR = PROFESSIONAL.pinDotColor;
export const PIN_DOT_RADIUS = PROFESSIONAL.pinDotRadius;
export const PIN_LABEL_COLOR = PROFESSIONAL.pinLabelColor;
export const TAG_COLOR = PROFESSIONAL.tagColor;
export const TAG_FONT = PROFESSIONAL.tagFont;
export const WIRE_WIDTH = PROFESSIONAL.wireWidth;
export const WIRE_WIDTH_SELECTED = PROFESSIONAL.wireWidthSelected;
export const WIRE_COLORS = PROFESSIONAL.wireColors;
export const WIRE_LABEL_BG = PROFESSIONAL.wireLabelBg;
export const WIRE_LABEL_FONT = PROFESSIONAL.wireLabelFont;
export const WIRE_ENDPOINT_COLOR = PROFESSIONAL.wireEndpointColor;
export const WIRE_ENDPOINT_RADIUS = PROFESSIONAL.wireEndpointRadius;
export const WIRE_ENDPOINT_SELECTED_COLOR = PROFESSIONAL.wireEndpointSelectedColor;
export const WIRE_ENDPOINT_SELECTED_RADIUS = PROFESSIONAL.wireEndpointSelectedRadius;
export const WAYPOINT_FILL = PROFESSIONAL.waypointFill;
export const WAYPOINT_STROKE = PROFESSIONAL.waypointStroke;
export const WAYPOINT_RADIUS = PROFESSIONAL.waypointRadius;
export const SELECTION_COLOR = PROFESSIONAL.selectionColor;
export const SELECTION_WIDTH = PROFESSIONAL.selectionWidth;
export const SELECTION_DASH = PROFESSIONAL.selectionDash;
export const MARQUEE_WINDOW_COLOR = PROFESSIONAL.marqueeWindowColor;
export const MARQUEE_WINDOW_FILL = PROFESSIONAL.marqueeWindowFill;
export const MARQUEE_CROSSING_COLOR = PROFESSIONAL.marqueeCrossingColor;
export const MARQUEE_CROSSING_FILL = PROFESSIONAL.marqueeCrossingFill;
export const WIRE_START_HIGHLIGHT = PROFESSIONAL.wireStartHighlight;
export const WIRE_START_FILL = PROFESSIONAL.wireStartFill;
export const WIRE_PREVIEW_COLOR = PROFESSIONAL.wirePreviewColor;
export const DRAG_ENDPOINT_COLOR = PROFESSIONAL.dragEndpointColor;
export const ANNOTATION_COLOR = PROFESSIONAL.annotationColor;
export const ANNOTATION_SELECTION_COLOR = PROFESSIONAL.annotationSelectionColor;
export const JUNCTION_FILL = PROFESSIONAL.junctionFill;
export const LADDER_RAIL_LABEL_COLOR = PROFESSIONAL.ladderRailLabelColor;
export const LADDER_VOLTAGE_COLOR = PROFESSIONAL.ladderVoltageColor;
export const LADDER_RUNG_GUIDE_COLOR = PROFESSIONAL.ladderRungGuideColor;
export const LADDER_RUNG_NUMBER_COLOR = PROFESSIONAL.ladderRungNumberColor;
export const LADDER_RUNG_DESC_COLOR = PROFESSIONAL.ladderRungDescColor;
export const TITLE_BLOCK_BG = PROFESSIONAL.titleBlockBg;
export const TITLE_BLOCK_BORDER = PROFESSIONAL.titleBlockBorder;
export const TITLE_BLOCK_DIVIDER = PROFESSIONAL.titleBlockDivider;
export const TITLE_BLOCK_TITLE_COLOR = PROFESSIONAL.titleBlockTitleColor;
export const TITLE_BLOCK_FIELD_COLOR = PROFESSIONAL.titleBlockFieldColor;
export const TITLE_BLOCK_SHEET_COLOR = PROFESSIONAL.titleBlockSheetColor;
export const ACCENT_COLOR = PROFESSIONAL.accentColor;
