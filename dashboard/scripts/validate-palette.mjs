// Palette validator — the design-stack rule is that palettes are validated by
// computation, never eyeballed. Reads the OKLCH tokens declared below (they
// mirror src/styles/tokens.css — v2 DARK terminal-native theme, DESIGN.md
// "Register + theme") and asserts:
//   1. DESIGN.md v2 contrast floor: ink >= 12:1 on bg; muted >= 4.5:1 on
//      panel AND raised; accent carries TEXT at >= 4.5:1 on bg and panel
//   2. every status color >= 4.5:1 on bg, panel, AND its own opaque pill
//      ground; chroma floor 0.11 on the five chromatic statuses
//   3. CVD safety: every pair of status colors stays distinguishable under
//      protanopia / deuteranopia / tritanopia, by OKLab dE, not by eye
// Run: node dashboard/scripts/validate-palette.mjs
// Exit 1 on any failure, so it can gate CI later.

// ---------- color math ----------

const clamp01 = (x) => Math.min(1, Math.max(0, x))

// OKLab -> linear sRGB (Björn Ottosson's matrices)
function oklabToLinearRgb(L, a, b) {
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
const oklchToLinearRgb = (L, C, hDeg) => {
  const h = (hDeg * Math.PI) / 180
  return oklabToLinearRgb(L, C * Math.cos(h), C * Math.sin(h))
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
// hex() clamps; out-of-gamut would ship a silently different color.
const inGamut = (lin) => lin.every((c) => c >= -1e-4 && c <= 1 + 1e-4)

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

// ---------- the palette under test (v2 dark) ----------

const oklch = (L, C, h) => ({ L, C, h, lin: oklchToLinearRgb(L, C, h), css: `oklch(${L} ${C} ${h})` })

const T = {
  bg: oklch(0.155, 0.014, 278),
  panel: oklch(0.19, 0.016, 278),
  raised: oklch(0.23, 0.018, 278),
  line: oklch(0.34, 0.02, 278),
  lineStrong: oklch(0.46, 0.02, 278),
  ink: oklch(0.93, 0.008, 278),
  muted: oklch(0.76, 0.012, 278),
  // On dark, one accent step carries text AND fills (10.2:1 on --bg); the
  // v1 accent/accent-strong split is gone.
  accent: oklch(0.78, 0.11, 205),
}

// Status vocabulary. Every one of these also ships a distinct glyph and a
// distinct fill/stroke treatment — color is never the only channel (WCAG 1.4.1).
// These six values are not eyeballed. They came out of a constrained search
// that maximised the worst-case OKLab distance between every pair under all
// three dichromacies, subject to >=4.5:1 on --bg, --panel and the pill ground,
// L in DESIGN.md's 0.68-0.80 band, and a chroma floor of 0.11 so each one
// still reads as its semantic hue. Nudge one and re-run this file.
const STATUS = {
  clean: oklch(0.79, 0.11, 150),
  pending: oklch(0.77, 0.13, 233),
  new: oklch(0.69, 0.17, 308),
  changed: oklch(0.8, 0.16, 78),
  conflict: oklch(0.68, 0.13, 35),
  missing: oklch(0.71, 0.016, 278),
}
const CHROMATIC = ['clean', 'pending', 'new', 'changed', 'conflict']

// Pill grounds are OPAQUE: tokens.css uses
// `color-mix(in oklab, <status> 14%, <--panel>)`, and oklab interpolation is
// NOT linear-sRGB interpolation — modelling it as the latter over-predicted
// contrast by ~0.3 on the v1 light theme and shipped a ground that measured
// 4.30:1 on the page. So mix in OKLab coordinates, exactly as the browser does.
const toLab = (c) => {
  const h = (c.h * Math.PI) / 180
  return [c.L, c.C * Math.cos(h), c.C * Math.sin(h)]
}
const SOFT_MIX = 0.14
const mixOverPanel = (c, n = SOFT_MIX) => {
  const A = toLab(c)
  const B = toLab(T.panel)
  const m = A.map((v, i) => n * v + (1 - n) * B[i])
  return { lin: oklabToLinearRgb(...m) }
}

// ---------- assertions ----------

const results = []
const check = (name, pass, detail) => results.push({ name, pass, detail })
const r2 = (n) => Math.round(n * 100) / 100

// 0. every shipped value is a real sRGB color (hex fallbacks must be honest)
{
  const all = [
    ...Object.values(T).map((c) => c.lin),
    ...Object.values(STATUS).map((c) => c.lin),
    ...Object.values(STATUS).map((c) => mixOverPanel(c).lin),
  ]
  check('all tokens inside sRGB gamut', all.every(inGamut), `${all.length} colors`)
}

// 1. DESIGN.md v2 contrast floor
check('ink on bg >= 12:1', contrast(T.ink.lin, T.bg.lin) >= 12, `${r2(contrast(T.ink.lin, T.bg.lin))}:1`)
check(
  'muted on panel >= 4.5:1',
  contrast(T.muted.lin, T.panel.lin) >= 4.5,
  `${r2(contrast(T.muted.lin, T.panel.lin))}:1`
)
check(
  'muted on raised >= 4.5:1',
  contrast(T.muted.lin, T.raised.lin) >= 4.5,
  `${r2(contrast(T.muted.lin, T.raised.lin))}:1`
)
check(
  'accent text on bg >= 4.5:1',
  contrast(T.accent.lin, T.bg.lin) >= 4.5,
  `${r2(contrast(T.accent.lin, T.bg.lin))}:1`
)
check(
  'accent text on panel >= 4.5:1',
  contrast(T.accent.lin, T.panel.lin) >= 4.5,
  `${r2(contrast(T.accent.lin, T.panel.lin))}:1`
)
check('accent stays phosphor-calm (C <= 0.12)', T.accent.C <= 0.12, `C=${T.accent.C}`)

// 2. Status pills are a tinted surface + the status color as TEXT (the GitHub /
// Linear shape), never a saturated fill. Small-text contrast, 4.5:1, against
// every ground a status can sit on — including its own opaque pill ground, the
// pair that proved alpha grounds were a real failure on the light theme.
for (const [k, c] of Object.entries(STATUS)) {
  check(`status "${k}" text on bg >= 4.5:1`, contrast(c.lin, T.bg.lin) >= 4.5, `${r2(contrast(c.lin, T.bg.lin))}:1`)
  check(
    `status "${k}" text on panel >= 4.5:1`,
    contrast(c.lin, T.panel.lin) >= 4.5,
    `${r2(contrast(c.lin, T.panel.lin))}:1`
  )
  const ground = mixOverPanel(c)
  check(
    `status "${k}" on its opaque pill ground >= 4.5:1`,
    contrast(c.lin, ground.lin) >= 4.5,
    `${r2(contrast(c.lin, ground.lin))}:1`
  )
}
for (const k of CHROMATIC)
  check(`status "${k}" chroma >= 0.11`, STATUS[k].C >= 0.11, `C=${STATUS[k].C}`)
for (const [k, c] of Object.entries(STATUS))
  check(`status "${k}" L in 0.68-0.80`, c.L >= 0.68 && c.L <= 0.8, `L=${c.L}`)

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
for (const [k, v] of Object.entries(T)) console.log(`  --${k.padEnd(10)} ${v.css.padEnd(26)} ${hex(v.lin)}`)
console.log('\nSTATUS')
for (const [k, v] of Object.entries(STATUS)) {
  console.log(
    `  --status-${k.padEnd(9)} ${v.css.padEnd(26)} ${hex(v.lin)}   pill ground ${hex(mixOverPanel(v).lin)}`
  )
}

console.log('\nCHECKS')
let failed = 0
for (const r of results) {
  if (!r.pass) failed++
  console.log(`  ${r.pass ? 'PASS' : 'FAIL'}  ${r.name.padEnd(46)} ${r.detail}`)
}
console.log(`\n${results.length - failed}/${results.length} passed\n`)
process.exit(failed ? 1 : 0)
