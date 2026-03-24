/**
 * Inspector panel section renderers — collapsible property groups.
 *
 * Each `render*Section()` function creates a self-contained collapsible section
 * with editable fields for a category of CSS properties. Changes are reported
 * through the `ChangeHandler` callback so the parent panel can track them.
 *
 * Sections: Box Model, Position & Layout, Background, Typography, Border, Effects.
 */

import { toHex as rgbToHex } from './color-utils.js'
import { T } from './design-tokens.js'

/* ─── Types ─── */

/** Called whenever a field value changes. Parent panel accumulates these. */
export type ChangeHandler = (property: string, original: string, newValue: string) => void

/* ─── Section Shell ─── */

interface SectionParts {
  wrapper: HTMLElement
  content: HTMLElement
}

function createSection(title: string, iconSvg: string, collapsed = false): SectionParts {
  const wrapper = document.createElement('div')
  Object.assign(wrapper.style, {
    borderBottom: `1px solid ${T.border}`,
  })

  // Header (clickable toggle)
  const header = document.createElement('button')
  Object.assign(header.style, {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '7px 12px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: T.text,
    fontFamily: T.font,
    fontSize: '10px',
    fontWeight: '600',
    letterSpacing: '0.5px',
    textTransform: 'uppercase' as const,
    transition: 'background 0.15s ease',
    outline: 'none',
  })
  header.addEventListener('mouseenter', () => { header.style.background = T.sectionHover })
  header.addEventListener('mouseleave', () => { header.style.background = 'transparent' })

  // Chevron
  const chevron = document.createElement('span')
  chevron.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`
  Object.assign(chevron.style, {
    display: 'flex',
    transition: 'transform 0.15s ease',
    color: T.textMuted,
    transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
  })

  // Icon
  const icon = document.createElement('span')
  icon.innerHTML = iconSvg
  Object.assign(icon.style, { display: 'flex', color: T.textMuted })

  // Label
  const label = document.createElement('span')
  label.textContent = title

  header.appendChild(chevron)
  header.appendChild(icon)
  header.appendChild(label)

  // Content area
  const content = document.createElement('div')
  Object.assign(content.style, {
    padding: collapsed ? '0' : '4px 12px 10px',
    display: collapsed ? 'none' : 'flex',
    flexDirection: 'column',
    gap: '6px',
    overflow: 'hidden',
  })

  // Toggle
  header.addEventListener('click', () => {
    const isOpen = content.style.display !== 'none'
    content.style.display = isOpen ? 'none' : 'flex'
    content.style.padding = isOpen ? '0' : '4px 12px 10px'
    chevron.style.transform = isOpen ? 'rotate(-90deg)' : 'rotate(0)'
  })

  wrapper.appendChild(header)
  wrapper.appendChild(content)
  return { wrapper, content }
}

/* ─── Field Helpers ─── */

function createFieldRow(label: string): { row: HTMLElement; valueEl: HTMLElement } {
  const row = document.createElement('div')
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    minHeight: '26px',
  })

  const lbl = document.createElement('span')
  lbl.textContent = label
  Object.assign(lbl.style, {
    fontSize: '10px',
    color: T.textMuted,
    fontFamily: T.mono,
    flexShrink: '0',
    minWidth: '72px',
    letterSpacing: '0.2px',
  })

  const valueEl = document.createElement('div')
  Object.assign(valueEl.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flex: '1',
    justifyContent: 'flex-end',
  })

  row.appendChild(lbl)
  row.appendChild(valueEl)
  return { row, valueEl }
}

const INPUT_STYLES = {
  height: '26px',
  fontSize: '11px',
  color: T.text,
  fontFamily: T.mono,
  outline: 'none',
  border: `1px solid ${T.inputBorder}`,
  borderRadius: '5px',
  background: T.inputBg,
  padding: '0 8px',
  transition: 'border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease',
  boxSizing: 'border-box' as const,
}

function addFocusStyle(input: HTMLInputElement | HTMLSelectElement): void {
  input.addEventListener('focus', () => {
    input.style.borderColor = T.inputBorderFocus
    input.style.background = T.inputBgFocus
    input.style.boxShadow = `0 0 0 2px ${T.accentGlow}`
  })
  input.addEventListener('blur', () => {
    input.style.borderColor = T.inputBorder
    input.style.background = T.inputBg
    input.style.boxShadow = 'none'
  })
}

function createTextInput(
  value: string, width: string,
  onChange: (val: string) => void,
): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'text'
  input.value = value
  Object.assign(input.style, { ...INPUT_STYLES, width })
  addFocusStyle(input)
  input.addEventListener('change', () => onChange(input.value))
  return input
}

function createNumberInput(
  value: string, width: string,
  onChange: (val: string) => void,
): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'number'
  input.value = value
  Object.assign(input.style, { ...INPUT_STYLES, width })
  addFocusStyle(input)
  input.addEventListener('change', () => onChange(input.value))
  return input
}

function createColorInput(value: string, onChange: (hex: string) => void): HTMLInputElement {
  const input = document.createElement('input')
  input.type = 'color'
  input.value = rgbToHex(value)
  Object.assign(input.style, {
    width: '20px',
    height: '20px',
    padding: '1px',
    cursor: 'pointer',
    border: `1.5px solid ${T.inputBorder}`,
    borderRadius: '6px',
    background: 'transparent',
    flexShrink: '0',
    transition: 'border-color 0.15s ease',
  })
  input.addEventListener('input', () => onChange(input.value))
  return input
}

function createSelectInput(
  value: string, options: string[],
  onChange: (val: string) => void,
): HTMLSelectElement {
  const select = document.createElement('select')
  for (const opt of options) {
    const o = document.createElement('option')
    o.value = opt
    o.textContent = opt
    if (value === opt || value.includes(opt)) o.selected = true
    select.appendChild(o)
  }
  Object.assign(select.style, { ...INPUT_STYLES, width: '80px', cursor: 'pointer' })
  addFocusStyle(select)
  select.addEventListener('change', () => onChange(select.value))
  return select
}

/** 4-value shorthand input row (e.g., margin/padding with T/R/B/L) */
function createFourValueRow(
  label: string,
  values: { top: string; right: string; bottom: string; left: string },
  color: string,
  onChangeSide: (side: string, val: string) => void,
): HTMLElement {
  const row = document.createElement('div')
  Object.assign(row.style, {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
  })

  const lbl = document.createElement('span')
  lbl.textContent = label
  Object.assign(lbl.style, {
    fontSize: '10px',
    fontWeight: '600',
    color,
    fontFamily: T.font,
    width: '52px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.3px',
    opacity: '0.8',
  })
  row.appendChild(lbl)

  for (const [side, val] of [['top', values.top], ['right', values.right], ['bottom', values.bottom], ['left', values.left]] as const) {
    const input = createNumberInput(parseFloat(val).toString(), '40px', (v) => {
      onChangeSide(side, `${v}px`)
    })
    input.title = side
    input.placeholder = side[0]!.toUpperCase()
    Object.assign(input.style, { textAlign: 'center', padding: '0 2px' })
    row.appendChild(input)
  }

  return row
}

/* ─── Section SVG Icons (14×14) ─── */

const svg14 = (inner: string) =>
  `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`

const ICONS = {
  boxModel: svg14('<rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/>'),
  position: svg14('<path d="M12 2v20M2 12h20"/><circle cx="12" cy="12" r="3"/>'),
  background: svg14('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>'),
  typography: svg14('<polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/>'),
  border: svg14('<rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="4 2"/>'),
  effects: svg14('<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20"/>'),
}

/* ═══════════════════════════════════════════════════
   Section Renderers
   ═══════════════════════════════════════════════════ */

/**
 * Box Model — visual margin/padding display with editable values
 */
export function renderBoxModelSection(
  el: HTMLElement,
  computed: CSSStyleDeclaration,
  onChange: ChangeHandler,
): HTMLElement {
  const { wrapper, content } = createSection('Box Model', ICONS.boxModel)

  // Visual box model diagram (simplified nested boxes)
  const diagram = document.createElement('div')
  Object.assign(diagram.style, {
    position: 'relative',
    padding: '12px',
    background: `${T.marginColor}15`,
    border: `1px dashed ${T.marginColor}40`,
    borderRadius: '4px',
    marginBottom: '6px',
  })

  // Margin label
  const marginLabel = document.createElement('span')
  marginLabel.textContent = 'margin'
  Object.assign(marginLabel.style, {
    position: 'absolute', top: '2px', left: '4px',
    fontSize: '8px', color: T.marginColor, fontFamily: T.mono, opacity: '0.7',
  })
  diagram.appendChild(marginLabel)

  // Padding box
  const paddingBox = document.createElement('div')
  Object.assign(paddingBox.style, {
    padding: '12px',
    background: `${T.paddingColor}15`,
    border: `1px dashed ${T.paddingColor}40`,
    borderRadius: '3px',
    position: 'relative',
  })

  const paddingLabel = document.createElement('span')
  paddingLabel.textContent = 'padding'
  Object.assign(paddingLabel.style, {
    position: 'absolute', top: '2px', left: '4px',
    fontSize: '8px', color: T.paddingColor, fontFamily: T.mono, opacity: '0.7',
  })
  paddingBox.appendChild(paddingLabel)

  // Content box
  const contentBox = document.createElement('div')
  Object.assign(contentBox.style, {
    padding: '6px 10px',
    background: `${T.contentColor}15`,
    border: `1px solid ${T.contentColor}40`,
    borderRadius: '2px',
    textAlign: 'center',
    fontSize: '10px',
    fontFamily: T.mono,
    color: T.contentColor,
  })
  const w = Math.round(parseFloat(computed.width))
  const h = Math.round(parseFloat(computed.height))
  contentBox.textContent = `${w} × ${h}`

  paddingBox.appendChild(contentBox)
  diagram.appendChild(paddingBox)
  content.appendChild(diagram)

  // Margin fields
  content.appendChild(createFourValueRow(
    'margin',
    {
      top: computed.marginTop,
      right: computed.marginRight,
      bottom: computed.marginBottom,
      left: computed.marginLeft,
    },
    T.marginColor,
    (side, val) => {
      const prop = `margin-${side}`
      el.style.setProperty(prop, val)
      onChange(prop, computed.getPropertyValue(prop), val)
    },
  ))

  // Padding fields
  content.appendChild(createFourValueRow(
    'padding',
    {
      top: computed.paddingTop,
      right: computed.paddingRight,
      bottom: computed.paddingBottom,
      left: computed.paddingLeft,
    },
    T.paddingColor,
    (side, val) => {
      const prop = `padding-${side}`
      el.style.setProperty(prop, val)
      onChange(prop, computed.getPropertyValue(prop), val)
    },
  ))

  // Width / Height
  const sizeRow = document.createElement('div')
  Object.assign(sizeRow.style, {
    display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px',
  })

  for (const prop of ['width', 'height'] as const) {
    const { row, valueEl } = createFieldRow(prop)
    const input = createTextInput(computed.getPropertyValue(prop), '64px', (val) => {
      el.style.setProperty(prop, val)
      onChange(prop, computed.getPropertyValue(prop), val)
    })
    valueEl.appendChild(input)
    sizeRow.appendChild(row)
    row.style.flex = '1'
  }
  content.appendChild(sizeRow)

  return wrapper
}

/**
 * Position & Layout — display, position, flex properties
 */
export function renderPositionSection(
  el: HTMLElement,
  computed: CSSStyleDeclaration,
  onChange: ChangeHandler,
): HTMLElement {
  const { wrapper, content } = createSection('Position & Layout', ICONS.position, true)

  // Display
  const { row: displayRow, valueEl: displayVal } = createFieldRow('display')
  displayVal.appendChild(createSelectInput(
    computed.display,
    ['block', 'inline', 'inline-block', 'flex', 'inline-flex', 'grid', 'none', 'contents'],
    (val) => { el.style.display = val; onChange('display', computed.display, val) },
  ))
  content.appendChild(displayRow)

  // Position
  const { row: posRow, valueEl: posVal } = createFieldRow('position')
  posVal.appendChild(createSelectInput(
    computed.position,
    ['static', 'relative', 'absolute', 'fixed', 'sticky'],
    (val) => { el.style.position = val; onChange('position', computed.position, val) },
  ))
  content.appendChild(posRow)

  // Flex direction (only meaningful when display is flex/inline-flex)
  if (computed.display.includes('flex')) {
    const { row: fdRow, valueEl: fdVal } = createFieldRow('flex-direction')
    fdVal.appendChild(createSelectInput(
      computed.flexDirection,
      ['row', 'row-reverse', 'column', 'column-reverse'],
      (val) => { el.style.flexDirection = val; onChange('flex-direction', computed.flexDirection, val) },
    ))
    content.appendChild(fdRow)

    const { row: jcRow, valueEl: jcVal } = createFieldRow('justify-content')
    jcVal.appendChild(createSelectInput(
      computed.justifyContent,
      ['flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly'],
      (val) => { el.style.justifyContent = val; onChange('justify-content', computed.justifyContent, val) },
    ))
    content.appendChild(jcRow)

    const { row: aiRow, valueEl: aiVal } = createFieldRow('align-items')
    aiVal.appendChild(createSelectInput(
      computed.alignItems,
      ['stretch', 'flex-start', 'center', 'flex-end', 'baseline'],
      (val) => { el.style.alignItems = val; onChange('align-items', computed.alignItems, val) },
    ))
    content.appendChild(aiRow)

    const { row: gapRow, valueEl: gapVal } = createFieldRow('gap')
    gapVal.appendChild(createTextInput(computed.gap, '64px', (val) => {
      el.style.gap = val; onChange('gap', computed.gap, val)
    }))
    content.appendChild(gapRow)
  }

  // Overflow
  const { row: ovRow, valueEl: ovVal } = createFieldRow('overflow')
  ovVal.appendChild(createSelectInput(
    computed.overflow,
    ['visible', 'hidden', 'scroll', 'auto', 'clip'],
    (val) => { el.style.overflow = val; onChange('overflow', computed.overflow, val) },
  ))
  content.appendChild(ovRow)

  // z-index
  const { row: ziRow, valueEl: ziVal } = createFieldRow('z-index')
  ziVal.appendChild(createTextInput(computed.zIndex, '56px', (val) => {
    el.style.zIndex = val; onChange('z-index', computed.zIndex, val)
  }))
  content.appendChild(ziRow)

  return wrapper
}

/**
 * Background — color picker, image, opacity
 */
export function renderBackgroundSection(
  el: HTMLElement,
  computed: CSSStyleDeclaration,
  onChange: ChangeHandler,
): HTMLElement {
  const { wrapper, content } = createSection('Background', ICONS.background)

  // Background color
  const { row: bgRow, valueEl: bgVal } = createFieldRow('color')
  const bgColor = computed.backgroundColor
  const colorInput = createColorInput(bgColor, (hex) => {
    el.style.backgroundColor = hex
    hexLabel.textContent = hex
    onChange('background-color', bgColor, hex)
  })
  const hexLabel = document.createElement('span')
  hexLabel.textContent = rgbToHex(bgColor)
  Object.assign(hexLabel.style, {
    fontSize: '11px', fontFamily: T.mono, color: T.text,
  })
  bgVal.appendChild(colorInput)
  bgVal.appendChild(hexLabel)
  content.appendChild(bgRow)

  // Background image (read-only display)
  const bgImage = computed.backgroundImage
  if (bgImage && bgImage !== 'none') {
    const { row: biRow, valueEl: biVal } = createFieldRow('image')
    const truncated = bgImage.length > 30 ? `${bgImage.slice(0, 30)}…` : bgImage
    const biLabel = document.createElement('span')
    biLabel.textContent = truncated
    biLabel.title = bgImage
    Object.assign(biLabel.style, {
      fontSize: '10px', fontFamily: T.mono, color: T.textMuted,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    })
    biVal.appendChild(biLabel)
    content.appendChild(biRow)
  }

  // Opacity
  const { row: opRow, valueEl: opVal } = createFieldRow('opacity')
  const opInput = document.createElement('input')
  opInput.type = 'range'
  opInput.min = '0'
  opInput.max = '1'
  opInput.step = '0.05'
  opInput.value = computed.opacity
  Object.assign(opInput.style, {
    width: '80px', height: '4px', cursor: 'pointer',
    accentColor: T.accent,
  })
  const opLabel = document.createElement('span')
  opLabel.textContent = computed.opacity
  Object.assign(opLabel.style, {
    fontSize: '11px', fontFamily: T.mono, color: T.text, width: '28px', textAlign: 'right',
  })
  opInput.addEventListener('input', () => {
    el.style.opacity = opInput.value
    opLabel.textContent = opInput.value
    onChange('opacity', computed.opacity, opInput.value)
  })
  opVal.appendChild(opInput)
  opVal.appendChild(opLabel)
  content.appendChild(opRow)

  return wrapper
}

/**
 * Typography — font, size, weight, line-height, color, alignment
 */
export function renderTypographySection(
  el: HTMLElement,
  computed: CSSStyleDeclaration,
  onChange: ChangeHandler,
): HTMLElement {
  const { wrapper, content } = createSection('Typography', ICONS.typography)

  // Text color
  const { row: colorRow, valueEl: colorVal } = createFieldRow('color')
  const textColor = computed.color
  const tcInput = createColorInput(textColor, (hex) => {
    el.style.color = hex
    tcHex.textContent = hex
    onChange('color', textColor, hex)
  })
  const tcHex = document.createElement('span')
  tcHex.textContent = rgbToHex(textColor)
  Object.assign(tcHex.style, { fontSize: '11px', fontFamily: T.mono, color: T.text })
  colorVal.appendChild(tcInput)
  colorVal.appendChild(tcHex)
  content.appendChild(colorRow)

  // Font family (read-only — changing font family via inline style rarely works well)
  const { row: ffRow, valueEl: ffVal } = createFieldRow('font-family')
  const ffLabel = document.createElement('span')
  const fontFamily = computed.fontFamily
  ffLabel.textContent = fontFamily.split(',')[0]?.trim().replace(/"/g, '') ?? fontFamily
  ffLabel.title = fontFamily
  Object.assign(ffLabel.style, {
    fontSize: '11px', fontFamily: T.mono, color: T.text,
    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '120px',
  })
  ffVal.appendChild(ffLabel)
  content.appendChild(ffRow)

  // Font size
  const { row: fsRow, valueEl: fsVal } = createFieldRow('font-size')
  fsVal.appendChild(createNumberInput(
    parseFloat(computed.fontSize).toString(), '52px',
    (val) => {
      const px = `${val}px`
      el.style.fontSize = px
      onChange('font-size', computed.fontSize, px)
    },
  ))
  const pxLabel = document.createElement('span')
  pxLabel.textContent = 'px'
  Object.assign(pxLabel.style, { fontSize: '10px', color: T.textMuted })
  fsVal.appendChild(pxLabel)
  content.appendChild(fsRow)

  // Font weight
  const { row: fwRow, valueEl: fwVal } = createFieldRow('font-weight')
  fwVal.appendChild(createSelectInput(
    computed.fontWeight,
    ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
    (val) => { el.style.fontWeight = val; onChange('font-weight', computed.fontWeight, val) },
  ))
  content.appendChild(fwRow)

  // Font style
  const { row: fiRow, valueEl: fiVal } = createFieldRow('font-style')
  fiVal.appendChild(createSelectInput(
    computed.fontStyle,
    ['normal', 'italic', 'oblique'],
    (val) => { el.style.fontStyle = val; onChange('font-style', computed.fontStyle, val) },
  ))
  content.appendChild(fiRow)

  // Line height
  const { row: lhRow, valueEl: lhVal } = createFieldRow('line-height')
  lhVal.appendChild(createTextInput(computed.lineHeight, '56px', (val) => {
    el.style.lineHeight = val; onChange('line-height', computed.lineHeight, val)
  }))
  content.appendChild(lhRow)

  // Letter spacing
  const { row: lsRow, valueEl: lsVal } = createFieldRow('letter-spacing')
  lsVal.appendChild(createTextInput(computed.letterSpacing, '56px', (val) => {
    el.style.letterSpacing = val; onChange('letter-spacing', computed.letterSpacing, val)
  }))
  content.appendChild(lsRow)

  // Text align
  const { row: taRow, valueEl: taVal } = createFieldRow('text-align')
  taVal.appendChild(createSelectInput(
    computed.textAlign,
    ['left', 'center', 'right', 'justify'],
    (val) => { el.style.textAlign = val; onChange('text-align', computed.textAlign, val) },
  ))
  content.appendChild(taRow)

  // Text decoration
  const { row: tdRow, valueEl: tdVal } = createFieldRow('text-decoration')
  tdVal.appendChild(createSelectInput(
    computed.textDecorationLine ?? computed.textDecoration?.split(' ')[0] ?? 'none',
    ['none', 'underline', 'overline', 'line-through'],
    (val) => { el.style.textDecoration = val; onChange('text-decoration', computed.textDecoration, val) },
  ))
  content.appendChild(tdRow)

  return wrapper
}

/**
 * Border — width, style, color, radius
 */
export function renderBorderSection(
  el: HTMLElement,
  computed: CSSStyleDeclaration,
  onChange: ChangeHandler,
): HTMLElement {
  const { wrapper, content } = createSection('Border', ICONS.border, true)

  // Border width
  const { row: bwRow, valueEl: bwVal } = createFieldRow('width')
  bwVal.appendChild(createTextInput(computed.borderWidth, '64px', (val) => {
    el.style.borderWidth = val; onChange('border-width', computed.borderWidth, val)
  }))
  content.appendChild(bwRow)

  // Border style
  const { row: bsRow, valueEl: bsVal } = createFieldRow('style')
  bsVal.appendChild(createSelectInput(
    computed.borderStyle,
    ['none', 'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'inset', 'outset'],
    (val) => { el.style.borderStyle = val; onChange('border-style', computed.borderStyle, val) },
  ))
  content.appendChild(bsRow)

  // Border color
  const { row: bcRow, valueEl: bcVal } = createFieldRow('color')
  const borderColor = computed.borderColor
  const bcInput = createColorInput(borderColor, (hex) => {
    el.style.borderColor = hex
    bcHex.textContent = hex
    onChange('border-color', borderColor, hex)
  })
  const bcHex = document.createElement('span')
  bcHex.textContent = rgbToHex(borderColor)
  Object.assign(bcHex.style, { fontSize: '11px', fontFamily: T.mono, color: T.text })
  bcVal.appendChild(bcInput)
  bcVal.appendChild(bcHex)
  content.appendChild(bcRow)

  // Border radius
  const { row: brRow, valueEl: brVal } = createFieldRow('radius')
  brVal.appendChild(createTextInput(computed.borderRadius, '64px', (val) => {
    el.style.borderRadius = val; onChange('border-radius', computed.borderRadius, val)
  }))
  content.appendChild(brRow)

  return wrapper
}

/**
 * Effects — box-shadow, transform, cursor
 */
export function renderEffectsSection(
  el: HTMLElement,
  computed: CSSStyleDeclaration,
  onChange: ChangeHandler,
): HTMLElement {
  const { wrapper, content } = createSection('Effects', ICONS.effects, true)

  // Box shadow
  const { row: bsRow, valueEl: bsVal } = createFieldRow('box-shadow')
  const shadowVal = computed.boxShadow
  const bsInput = createTextInput(
    shadowVal === 'none' ? '' : shadowVal,
    '130px',
    (val) => { el.style.boxShadow = val || 'none'; onChange('box-shadow', shadowVal, val || 'none') },
  )
  bsInput.placeholder = 'none'
  bsVal.appendChild(bsInput)
  content.appendChild(bsRow)

  // Transform
  const { row: tfRow, valueEl: tfVal } = createFieldRow('transform')
  const transformVal = computed.transform
  const tfInput = createTextInput(
    transformVal === 'none' ? '' : transformVal,
    '130px',
    (val) => { el.style.transform = val || 'none'; onChange('transform', transformVal, val || 'none') },
  )
  tfInput.placeholder = 'none'
  tfVal.appendChild(tfInput)
  content.appendChild(tfRow)

  // Cursor
  const { row: cRow, valueEl: cVal } = createFieldRow('cursor')
  cVal.appendChild(createSelectInput(
    computed.cursor,
    ['auto', 'default', 'pointer', 'text', 'move', 'not-allowed', 'grab', 'crosshair'],
    (val) => { el.style.cursor = val; onChange('cursor', computed.cursor, val) },
  ))
  content.appendChild(cRow)

  // Transition (read-only display)
  const transVal = computed.transition
  if (transVal && transVal !== 'all 0s ease 0s' && transVal !== 'none') {
    const { row: trRow, valueEl: trVal } = createFieldRow('transition')
    const trLabel = document.createElement('span')
    trLabel.textContent = transVal.length > 30 ? `${transVal.slice(0, 30)}…` : transVal
    trLabel.title = transVal
    Object.assign(trLabel.style, {
      fontSize: '10px', fontFamily: T.mono, color: T.textMuted,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    })
    trVal.appendChild(trLabel)
    content.appendChild(trRow)
  }

  return wrapper
}
