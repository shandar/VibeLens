/**
 * VibeLens Design Tokens — shared visual constants.
 *
 * Single source of truth for colors, fonts, dimensions, and shadows.
 * Imported by inspector-panel.ts and inspector-sections.ts.
 * This file is a leaf module — it imports nothing from the extension.
 *
 * Color direction: Chrome DevTools-inspired neutral dark, not purple/indigo.
 * Text is high-contrast (white/near-white) for readability.
 */

export const T = {
  // Surfaces — neutral dark grays (browser-native feel)
  panelBg:        '#1e1e1e',
  titleBarBg:     '#181818',
  sectionHover:   '#2a2a2a',
  inputBg:        'rgba(255,255,255,0.06)',
  inputBgFocus:   'rgba(99,102,241,0.10)',
  // Borders
  border:         'rgba(255,255,255,0.08)',
  inputBorder:    'rgba(255,255,255,0.12)',
  inputBorderFocus: '#6366f1',
  // Text — high contrast whites
  text:           '#e8e8e8',
  textMuted:      '#b0b0b0',
  textDim:        '#787878',
  // Accent
  accent:         '#6366f1',
  accentBg:       'rgba(99,102,241,0.12)',
  accentText:     '#a5b4fc',
  accentGlow:     'rgba(99,102,241,0.25)',
  white08:        'rgba(255,255,255,0.08)',
  // Semantic
  green:          '#22c55e',
  amber:          '#f59e0b',
  red:            '#ef4444',
  cyan:           '#22d3ee',
  violet:         '#a78bfa',
  // Box model
  marginColor:    '#f9a825',
  paddingColor:   '#66bb6a',
  contentColor:   '#42a5f5',
  // Traffic lights
  dotClose:       '#ff5f57',
  dotMinimize:    '#febc2e',
  dotMaximize:    '#28c840',
  // Fonts
  font:           '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
  mono:           'ui-monospace, "SF Mono", Monaco, "Cascadia Code", monospace',
  // Dimensions
  panelWidth:     348,
  panelRadius:    14,
  panelMargin:    12,
  // Shadows
  panelShadow:    '0 8px 48px rgba(0,0,0,0.5), 0 2px 12px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
  buttonShadow:   '0 2px 8px rgba(99,102,241,0.3)',
  // Scrollbar
  scrollThumb:    'rgba(255,255,255,0.15)',
  scrollThumbHover: 'rgba(255,255,255,0.25)',
  scrollTrack:    'transparent',
} as const
