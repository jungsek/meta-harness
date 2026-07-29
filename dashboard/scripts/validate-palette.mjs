// Palette validator — the design-stack rule is that palettes are validated by
// computation, never eyeballed. Reads the OKLCH tokens declared below (they
// mirror src/styles/tokens.css) and asserts:
//   1. WCAG 2.2 contrast for every text-on-surface pair we actually ship
//   2. impeccable's numeric palette rules (ink>=7:1, primary chroma, etc.)
//   3. CVD safety: every pair of status colors stays distinguishable under
//      protanopia / deuteranopia / tritanopia, by OKLab dE, not by eye
// Run: node dashboard/scripts/validate-palette.mjs
// Exit 1 on any failure, so it can gate CI later.

// ---------- color math ----------

const clamp01 = (x) => Math.min(1, Math.max(0, x))

// OKLCH -> OKLab -> linear sRGB (Björn Ottosson's matrices)
function oklchToLinearRgb(L, C, hDeg) {
  const h = (hDeg * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

function linearRgbToOklab([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}

const encode = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(clamp01(c), 1 / 2.4) - 0.055)
const hex = (lin) =>
  '#' +
  lin
    .map((c) => Math.round(clamp01(encode(c)) * 255).toString(16).padStart(2, '0'))
    .join('')

// WCAG 2.x relative luminance wants linear-light sRGB, which is what we have.
const luminance = ([r, g, b]) => 0.2126 * clamp01(r) + 0.7152 * clamp01(g) + 0.0722 * clamp01(b)
const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Viénot/Brettel/Mollon 1999 dichromat simulation, applied in linear RGB.
// Standard published matrices — the same ones colorblind checkers use.
const CVD = {
  protanopia: [0.0, 1.05118294, -0.05116099, 0, 1, 0, 0, 0, 1],
  deuteranopia: [1, 0, 0, 0.9513092, 0, 0.04866992, 0, 0, 1],
  tritanopia: [1, 0, 0, 0, 1, 0, -0.86744736, 1.86727089, 0],
}
const LMS_FROM_RGB = [17.8824, 43.5161, 4.11935, 3.45565, 27.1554, 3.86714, 0.0299566, 0.184309, 1.46709]
const RGB_FROM_LMS = [
  0.080944447, -0.13050440, 0.116721066, -0.010248533, 0.054019326, -0.113614708, -0.000365296, -0.004121614,
  0.693511405,
]
const mul = (m, [x, y, z]) => [
  m[0] * x + m[1] * y + m[2] * z,
  m[3] * x + m[4] * y + m[5] * z,
  m[6] * x + m[7] * y + m[8] * z,
]
const simulate = (lin, kind) => mul(RGB_FROM_LMS, mul(CVD[kind], mul(LMS_FROM_RGB, lin.map(clamp01))))

// Perceptual distance in OKLab. dE ~= 0.02 is a just-noticeable step for large
// fields; we want status colors clearly apart, not merely non-identical.
const deltaE = (a, b) => {
  const A = linearRgbToOklab(a)
  const B = linearRgbToOklab(b)
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2])
}

// ---------- the palette under test ----------

const oklch = (L, C, h) => ({ L, C, h, lin: oklchToLinearRgb(L, C, h), css: `oklch(${L} ${C} ${h})` })

const T = {
  bg: oklch(1, 0, 0),
  surface: oklch(0.976, 0.006, 278),
  raised: oklch(0.952, 0.008, 278),
  line: oklch(0.9, 0.008, 278),
  ink: oklch(0.19, 0.016, 278),
  muted: oklch(0.48, 0.014, 278),
  primary: oklch(0.42, 0.135, 278),
  accent: oklch(0.66, 0.128, 205),
  // --accent is a FILL and focus-ring color: at L 0.66 it cannot carry small
  // text on any of our light grounds (2.51:1 on --raised, measured on the
  // rendered page). Accent-colored TEXT uses this darker step instead.
  accentStrong: oklch(0.46, 0.1, 205),
}

// Status vocabulary. Every one of these also ships a distinct glyph and a
// distinct fill/stroke treatment — color is never the only channel (WCAG 1.4.1).
// These six values are not eyeballed. They came out of a constrained search
// (scripts/README notes the method) that maximised the worst-case OKLab
// distance between every pair under all three dichromacies, subject to
// >=4.5:1 on both --bg and --raised and a chroma floor of 0.11 so each one
// still reads as its semantic hue. Nudge one and re-run this file.
const STATUS = {
  clean: oklch(0.52, 0.15, 140),
  pending: oklch(0.54, 0.19, 260),
  new: oklch(0.34, 0.17, 288),
  changed: oklch(0.44, 0.13, 62),
  conflict: oklch(0.36, 0.13, 22),
  missing: oklch(0.5, 0.008, 278),
}

// ---------- assertions ----------

const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })
const r2 = (n) => Math.round(n * 100) / 100

// 1. impeccable numeric rules
check('ink vs bg >= 7:1', contrast(T.ink.lin, T.bg.lin) >= 7, `${r2(contrast(T.ink.lin, T.bg.lin))}:1`)
check('muted vs bg >= 3.5:1', contrast(T.muted.lin, T.bg.lin) >= 3.5, `${r2(contrast(T.muted.lin, T.bg.lin))}:1`)
check('primary chroma <= 0.23', T.primary.C <= 0.23, `C=${T.primary.C}`)
check(
  'primary L>0.78 => chroma <= 0.18',
  T.primary.L <= 0.78 || T.primary.C <= 0.18,
  `L=${T.primary.L} C=${T.primary.C}`
)
check(
  'primary vs accent >= 1.7',
  contrast(T.primary.lin, T.accent.lin) >= 1.7,
  `${r2(contrast(T.primary.lin, T.accent.lin))}:1`
)
check(
  'accent can hold text on a fill',
  T.accent.C >= 0.1 || T.accent.L >= 0.85 || T.accent.L <= 0.3,
  `L=${T.accent.L} C=${T.accent.C}`
)

// 2. text pairs we actually ship
const bodyPairs = [
  ['ink on bg', T.ink, T.bg],
  ['ink on surface', T.ink, T.surface],
  ['ink on raised', T.ink, T.raised],
  ['muted on bg', T.muted, T.bg],
  ['muted on surface', T.muted, T.surface],
  ['muted on raised', T.muted, T.raised],
  ['primary on bg', T.primary, T.bg],
  ['primary on surface', T.primary, T.surface],
  // The diff-pane header sits on --raised; its two tone labels must both pass
  // there. `native` uses --status-changed, already covered below.
  ['accentStrong on bg', T.accentStrong, T.bg],
  ['accentStrong on surface', T.accentStrong, T.surface],
  ['accentStrong on raised', T.accentStrong, T.raised],
]
for (const [name, fg, bg] of bodyPairs)
  check(`body text ${name} >= 4.5:1`, contrast(fg.lin, bg.lin) >= 4.5, `${r2(contrast(fg.lin, bg.lin))}:1`)

// Status pills are a tinted surface + the status color as TEXT (the GitHub /
// Linear shape), never a saturated fill with white text. So the requirement is
// small-text contrast, 4.5:1, against both surfaces a pill can sit on.
for (const [k, c] of Object.entries(STATUS)) {
  check(`status "${k}" text on bg >= 4.5:1`, contrast(c.lin, T.bg.lin) >= 4.5, `${r2(contrast(c.lin, T.bg.lin))}:1`)
  check(
    `status "${k}" text on raised >= 4.5:1`,
    contrast(c.lin, T.raised.lin) >= 4.5,
    `${r2(contrast(c.lin, T.raised.lin))}:1`
  )
}

// 2b. Status pills sit on their own tinted ground. That ground MUST be opaque:
// as an alpha it composited over whatever the row happened to be (expanded
// rows carry `bg-raised/60`), which measured 4.21:1 on the rendered page — a
// real failure that no static check catches. Opaque means the pill's contrast
// is the same everywhere, and this is the pair that proves it.
// Must model what the browser actually does. tokens.css uses
// `color-mix(in oklab, <status> N%, white)`, and oklab interpolation is NOT
// linear-sRGB interpolation — modelling it as the latter over-predicted
// contrast by ~0.3 and shipped a ground that measured 4.30:1 on the page.
// White in oklab is (1, 0, 0), so mixing toward it is just:
//   L' = n*L + (1-n)   ·   C' = n*C   ·   h unchanged
const mixOverWhite = (c, n) => oklch(n * c.L + (1 - n), n * c.C, c.h)
const SOFT_MIX = 0.1
for (const [k, c] of Object.entries(STATUS)) {
  const ground = mixOverWhite(c, SOFT_MIX)
  check(
    `status "${k}" on its opaque pill ground >= 4.5:1`,
    contrast(c.lin, ground.lin) >= 4.5,
    `${r2(contrast(c.lin, ground.lin))}:1`
  )
}

// 3. CVD separation across every status pair, in every dichromacy.
// 0.07 in OKLab is comfortably past a just-noticeable difference for the pill-
// sized fields we render; color is still never the only channel (glyph + word).
const MIN_DE = 0.07
const keys = Object.keys(STATUS)
for (const kind of Object.keys(CVD)) {
  let worst = { d: Infinity, pair: null }
  for (let i = 0; i < keys.length; i++)
    for (let j = i + 1; j < keys.length; j++) {
      const d = deltaE(simulate(STATUS[keys[i]].lin, kind), simulate(STATUS[keys[j]].lin, kind))
      if (d < worst.d) worst = { d, pair: `${keys[i]}/${keys[j]}` }
    }
  check(`CVD ${kind}: min pair dE >= ${MIN_DE}`, worst.d >= MIN_DE, `worst ${worst.pair} dE=${r2(worst.d)}`)
}

// ---------- report ----------

console.log('\nTOKENS')
for (const [k, v] of Object.entries(T)) console.log(`  --${k.padEnd(9)} ${v.css.padEnd(26)} ${hex(v.lin)}`)
console.log('\nSTATUS')
for (const [k, v] of Object.entries(STATUS)) console.log(`  --status-${k.padEnd(9)} ${v.css.padEnd(26)} ${hex(v.lin)}`)

console.log('\nCHECKS')
let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(46)} ${r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} passed\n`)
process.exit(failed ? 1 : 0)
