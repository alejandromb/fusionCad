/**
 * ThemePicker — compact dropdown + optional color pickers for custom theme.
 * Renders in the sidebar footer.
 */

import { THEME_LIST, type ThemeId, type CustomThemeInput } from '../renderer/theme';

interface ThemePickerProps {
  themeId: ThemeId;
  setThemeId: (id: ThemeId) => void;
  customColors: CustomThemeInput;
  setCustomColors: (colors: CustomThemeInput) => void;
}

const COLOR_FIELDS: { key: keyof CustomThemeInput; label: string }[] = [
  { key: 'canvasBg', label: 'Canvas' },
  { key: 'symbolColor', label: 'Symbols' },
  { key: 'accentColor', label: 'Accent' },
  { key: 'panelBg', label: 'Panels' },
  { key: 'textColor', label: 'Text' },
  { key: 'borderColor', label: 'Borders' },
  { key: 'wireBaseColor', label: 'Wires' },
];

export function ThemePicker({ themeId, setThemeId, customColors, setCustomColors }: ThemePickerProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--fc-text-muted, #888)' }}>Theme</span>
        <select
          value={themeId}
          onChange={e => setThemeId(e.target.value as ThemeId)}
          style={{
            flex: 1,
            padding: '0.25rem 0.4rem',
            fontSize: '0.75rem',
            background: 'var(--fc-bg-app, #1a1a1a)',
            border: '1px solid var(--fc-border-strong, #444)',
            borderRadius: '4px',
            color: 'var(--fc-text-primary, #e0e0e0)',
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          {THEME_LIST.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {themeId === 'custom' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
          {COLOR_FIELDS.map(({ key, label }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <input
                type="color"
                value={customColors[key] as string}
                onChange={e => setCustomColors({ ...customColors, [key]: e.target.value })}
                style={{
                  width: '22px',
                  height: '22px',
                  padding: 0,
                  border: '1px solid var(--fc-border-strong, #444)',
                  borderRadius: '3px',
                  cursor: 'pointer',
                  background: 'none',
                }}
              />
              <span style={{ fontSize: '0.7rem', color: 'var(--fc-text-muted, #888)' }}>{label}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={customColors.gridBrightness}
              onChange={e => setCustomColors({ ...customColors, gridBrightness: parseFloat(e.target.value) })}
              style={{ width: '60px' }}
            />
            <span style={{ fontSize: '0.7rem', color: 'var(--fc-text-muted, #888)' }}>Grid</span>
          </div>
        </div>
      )}
    </div>
  );
}
