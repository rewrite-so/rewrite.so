import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
let sharp;
try {
  sharp = require('sharp');
} catch {
  sharp = require('../../node_modules/.pnpm/node_modules/sharp');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = __dirname;

const font =
  "-apple-system, BlinkMacSystemFont, 'SF Pro Display', Inter, 'Segoe UI', Arial, sans-serif";

const color = {
  ink: '#151A1F',
  ink2: '#243039',
  muted: '#61707A',
  soft: '#F6F8F5',
  paper: '#FFFFFF',
  line: '#DDE5E2',
  teal: '#20C7B5',
  tealDark: '#119A8D',
  mint: '#E7F8F5',
  blue: '#3B82F6',
  blueSoft: '#EAF2FF',
  peach: '#F58B67',
  peachSoft: '#FFF1EA',
  yellow: '#F8C14A',
  yellowSoft: '#FFF8DE',
};

const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const svg = ({ width, height, body, dark = false }) => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="18" stdDeviation="26" flood-color="#0B1114" flood-opacity="0.14"/>
    </filter>
    <filter id="deepShadow" x="-30%" y="-30%" width="160%" height="170%" color-interpolation-filters="sRGB">
      <feDropShadow dx="0" dy="24" stdDeviation="34" flood-color="#0B1114" flood-opacity="0.22"/>
    </filter>
    <linearGradient id="warmBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FAFBF8"/>
      <stop offset="0.54" stop-color="#F3FAF8"/>
      <stop offset="1" stop-color="#FFF6ED"/>
    </linearGradient>
    <linearGradient id="darkPanel" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#11171B"/>
      <stop offset="1" stop-color="#1E2B2F"/>
    </linearGradient>
    <linearGradient id="tealGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2FE0CD"/>
      <stop offset="1" stop-color="#18AFA0"/>
    </linearGradient>
    <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M 32 0 L 0 0 0 32" stroke="${dark ? '#FFFFFF' : '#151A1F'}" stroke-opacity="${dark ? '0.05' : '0.045'}" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="${dark ? 'url(#darkPanel)' : 'url(#warmBg)'}"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  ${body}
</svg>`;

const text = (lines, x, y, size, weight, fill, opts = {}) => {
  const items = Array.isArray(lines) ? lines : [lines];
  const lineHeight = opts.lineHeight ?? Math.round(size * 1.22);
  const anchor = opts.anchor ? ` text-anchor="${opts.anchor}"` : '';
  const opacity = opts.opacity == null ? '' : ` opacity="${opts.opacity}"`;
  const spacing = opts.spacing == null ? '' : ` letter-spacing="${opts.spacing}"`;
  return `<text x="${x}" y="${y}" fill="${fill}" font-family="${font}" font-size="${size}" font-weight="${weight}"${anchor}${opacity}${spacing}>${items
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${esc(line)}</tspan>`)
    .join('')}</text>`;
};

const rect = (x, y, w, h, rx, fill, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" ${extra}/>`;

const strokeRect = (x, y, w, h, rx, fill, stroke, extra = '') =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}" ${extra}/>`;

const icon = (x, y, s) => {
  const k = s / 512;
  return `<g transform="translate(${x} ${y}) scale(${k})">
    <rect x="32" y="32" width="448" height="448" rx="108" fill="${color.ink}"/>
    <rect x="204" y="126" width="30" height="260" rx="12" fill="#F4F7FA"/>
    <rect x="286" y="322" width="58" height="58" rx="20" fill="${color.teal}"/>
  </g>`;
};

const brand = (x, y, dark = false) => `${icon(x, y - 34, 42)}
  ${text('rewrite.so', x + 54, y - 4, 24, 760, dark ? '#FFFFFF' : color.ink)}
  ${text('Chrome extension', x + 56, y + 20, 13, 650, dark ? '#94A3A1' : color.muted)}`;

const pill = (x, y, label, fill, stroke, textFill, w = null) => {
  const width = w ?? Math.max(72, label.length * 8 + 30);
  return `${strokeRect(x, y, width, 34, 17, fill, stroke)}
    ${text(label, x + width / 2, y + 22, 14, 720, textFill, { anchor: 'middle' })}`;
};

const key = (x, y, label, active = false) => `${strokeRect(
  x,
  y,
  62,
  42,
  12,
  active ? color.ink : '#FFFFFF',
  active ? color.ink : '#D6E0DC'
)}
  ${text(label, x + 31, y + 27, 15, 760, active ? '#FFFFFF' : color.ink, { anchor: 'middle' })}`;

const browserFrame = ({ x, y, w, h, title, children, url = 'rewrite.so/try' }) => `${rect(
  x,
  y,
  w,
  h,
  28,
  '#FFFFFF',
  'filter="url(#deepShadow)"'
)}
  ${rect(x, y, w, 76, 28, '#F7FAF8')}
  ${rect(x, y + 48, w, 28, 0, '#F7FAF8')}
  <circle cx="${x + 34}" cy="${y + 34}" r="8" fill="#FF6B5E"/>
  <circle cx="${x + 58}" cy="${y + 34}" r="8" fill="#FFC84A"/>
  <circle cx="${x + 82}" cy="${y + 34}" r="8" fill="#36D399"/>
  ${strokeRect(x + 118, y + 18, w - 154, 34, 17, '#FFFFFF', '#E2E9E5')}
  ${text(url, x + 142, y + 41, 14, 650, '#67757D')}
  ${title ? text(title, x + 34, y + 116, 24, 760, color.ink) : ''}
  ${children}`;

const textarea = (x, y, w, h, lines, active = true) => `${strokeRect(
  x,
  y,
  w,
  h,
  18,
  '#FBFDFB',
  active ? '#A9E8DF' : '#DDE5E2',
  active ? 'stroke-width="2"' : ''
)}
  ${text(lines, x + 26, y + 42, 22, 560, color.ink2, { lineHeight: 32 })}
  <rect x="${x + w - 34}" y="${y + h - 34}" width="10" height="10" rx="4" fill="${color.teal}" opacity="0.82"/>
  <path d="M${x + w - 46} ${y + h - 25} L${x + w - 63} ${y + h - 25}" stroke="${color.teal}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>`;

const candidateCard = (x, y, w, title, badge, lines, accent, fill = '#FFFFFF') => `${rect(
  x,
  y,
  w,
  128,
  18,
  fill,
  'filter="url(#softShadow)"'
)}
  <rect x="${x}" y="${y}" width="6" height="128" rx="3" fill="${accent}"/>
  ${text(title, x + 24, y + 34, 20, 790, color.ink)}
  ${pill(x + w - 74, y + 18, badge, '#F7FAF8', '#DFE8E4', color.muted, 48)}
  ${text(lines, x + 24, y + 68, 16, 560, color.ink2, { lineHeight: 23 })}`;

const arrow = (x1, y1, x2, y2, colorValue = color.teal) => `<path d="M${x1} ${y1} C${x1 + 40} ${y1}, ${x2 - 40} ${y2}, ${x2} ${y2}" stroke="${colorValue}" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M${x2 - 12} ${y2 - 9} L${x2} ${y2} L${x2 - 13} ${y2 + 8}" stroke="${colorValue}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

const downArrow = (x, y1, y2, colorValue = color.teal) => `<path d="M${x} ${y1} C${x} ${y1 + 16}, ${x} ${y2 - 16}, ${x} ${y2}" stroke="${colorValue}" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M${x - 9} ${y2 - 10} L${x} ${y2} L${x + 9} ${y2 - 10}" stroke="${colorValue}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;

const promoInput = (x, y, w, h, lines, size = 18) => `${strokeRect(
  x,
  y,
  w,
  h,
  18,
  '#FFFFFF',
  '#A9E8DF',
  'stroke-width="2" filter="url(#softShadow)"'
)}
  ${text(lines, x + 24, y + 34, size, 680, color.ink2, { lineHeight: Math.round(size * 1.42) })}
  <path d="M${x + w - 54} ${y + h - 30} L${x + w - 38} ${y + h - 30}" stroke="${color.teal}" stroke-width="2" stroke-linecap="round" opacity="0.25"/>
  <rect x="${x + w - 30}" y="${y + h - 36}" width="10" height="10" rx="4" fill="${color.teal}"/>`;

const promoChoice = (x, y, w, title, body, accent = color.teal) => `${rect(
  x,
  y,
  w,
  96,
  18,
  '#FFFFFF',
  'filter="url(#softShadow)"'
)}
  <rect x="${x}" y="${y}" width="5" height="96" rx="2.5" fill="${accent}"/>
  ${text(title, x + 22, y + 31, 17, 800, color.ink)}
  ${text(body, x + 22, y + 61, 15, 620, color.ink2)}`;

const screenshotRewrite = () =>
  svg({
    width: 1280,
    height: 800,
    body: `
      ${brand(70, 72)}
      ${text(['Write freely.', 'Send', 'confidently.'], 70, 150, 48, 820, color.ink, { lineHeight: 54 })}
      ${text(['Type the rough version first.', 'rewrite.so makes it ready.'], 72, 334, 22, 560, color.muted, { lineHeight: 32 })}
      ${key(72, 420, 'Shift', true)}
      ${key(146, 420, 'Shift', true)}
      ${text('double-tap shortcut', 72, 488, 16, 680, color.tealDark)}
      ${pill(72, 528, '3 tones', color.mint, '#BCEFE7', color.tealDark, 112)}
      ${pill(198, 528, 'No copy-paste', '#FFFFFF', '#DDE5E2', color.ink2, 146)}
      ${pill(72, 576, 'Sensitive fields excluded', color.peachSoft, '#FFD8C8', '#A74B2F', 240)}
      ${browserFrame({
        x: 444,
        y: 72,
        w: 766,
        h: 650,
        title: 'Compose',
        children: `
          ${textarea(494, 222, 644, 190, ['hi can u make this sound more clear', 'for the client before i send it?'])}
          ${downArrow(800, 424, 462)}
          ${candidateCard(520, 464, 580, 'Formal', '3', ['Could you make this clearer for the client', 'before I send it?'], color.teal, '#F7FFFD')}
          ${candidateCard(520, 608, 580, 'Casual', '2', ['Can you make this clearer before I send it', 'to the client?'], color.peach, '#FFFFFF')}
        `,
      })}
    `,
  });

const screenshotTones = () =>
  svg({
    width: 1280,
    height: 800,
    body: `
      ${brand(70, 72)}
      ${text(['Write freely.', 'Send confidently.'], 70, 142, 52, 820, color.ink, { lineHeight: 58 })}
      ${text('Choose the tone that makes your draft feel sendable.', 72, 202, 22, 560, color.muted)}
      ${strokeRect(92, 270, 1096, 92, 24, '#FFFFFF', '#E4ECE8', 'filter="url(#softShadow)"')}
      ${text('Original', 124, 308, 17, 760, color.muted)}
      ${text('Can you rewrite this so it sounds clearer but still like me?', 124, 342, 24, 620, color.ink2)}
      ${downArrow(620, 380, 424)}
      ${candidateCard(92, 454, 336, 'Faithful', '1', ['Can you rewrite this so it is clearer', 'while still sounding like me?'], color.blue, '#FAFCFF')}
      ${candidateCard(472, 454, 336, 'Casual', '2', ['Can you make this clearer, but still', 'sound like me?'], color.peach, '#FFFCFA')}
      ${candidateCard(852, 454, 336, 'Formal', '3', ['Please rewrite this for clarity while', 'preserving my original tone.'], color.teal, '#F7FFFD')}
      ${text('Press 1 / 2 / 3 or click a card to replace the text in place.', 286, 670, 23, 680, color.ink)}
      ${pill(464, 708, 'Faithful', color.blueSoft, '#C7DAFF', '#1D4ED8', 116)}
      ${pill(594, 708, 'Casual', color.peachSoft, '#FFD8C8', '#A74B2F', 102)}
      ${pill(710, 708, 'Formal', color.mint, '#BCEFE7', color.tealDark, 104)}
    `,
  });

const screenshotLanguage = () =>
  svg({
    width: 1280,
    height: 800,
    body: `
      ${brand(70, 72)}
      ${text(['Write here.', 'Send there.'], 70, 168, 58, 820, color.ink, { lineHeight: 64 })}
      ${text(['Keep the meaning.', 'Change the language.'], 72, 316, 22, 560, color.muted, { lineHeight: 32 })}
      ${strokeRect(72, 414, 268, 190, 24, '#FFFFFF', '#E4ECE8', 'filter="url(#softShadow)"')}
      ${text('Target language', 104, 462, 18, 760, color.ink)}
      ${pill(104, 486, 'Auto-detect', color.mint, '#BCEFE7', color.tealDark, 134)}
      ${pill(104, 536, 'English', '#FFFFFF', '#DDE5E2', color.ink2, 102)}
      ${pill(214, 536, '中文', '#FFFFFF', '#DDE5E2', color.ink2, 82)}
      ${browserFrame({
        x: 418,
        y: 86,
        w: 792,
        h: 620,
        title: 'Language-aware rewrite',
        url: 'rewrite.so/settings',
        children: `
          ${strokeRect(468, 212, 304, 276, 24, '#FFFFFF', '#DFE8E4', 'filter="url(#softShadow)"')}
          ${text('Original', 500, 260, 18, 760, color.muted)}
          ${text(['感谢你的更新。', '我们可以确认一下', '下一步时间安排吗？'], 500, 310, 23, 650, color.ink2, { lineHeight: 36 })}
          ${arrow(786, 350, 850, 350)}
          ${strokeRect(850, 212, 310, 276, 24, '#F7FFFD', '#BCEFE7', 'filter="url(#softShadow)"')}
          ${text('Formal English', 882, 260, 18, 760, color.tealDark)}
          ${text(['Thank you for the update.', 'Could we confirm the', 'timeline for next steps?'], 882, 310, 21, 650, color.ink2, { lineHeight: 35 })}
          ${strokeRect(528, 544, 572, 74, 18, '#FBFDFB', '#DDE5E2')}
          ${text('Preserve meaning. Change language. Keep writing.', 814, 590, 20, 700, color.ink, { anchor: 'middle' })}
        `,
      })}
    `,
  });

const screenshotPrivacy = () =>
  svg({
    width: 1280,
    height: 800,
    body: `
      ${brand(70, 72)}
      ${text(['Draft freely.', 'Stay private.'], 70, 168, 58, 820, color.ink, { lineHeight: 64 })}
      ${text(['Text leaves only on trigger.', 'Originals are not stored.'], 72, 320, 22, 560, color.muted, { lineHeight: 32 })}
      ${browserFrame({
        x: 420,
        y: 72,
        w: 790,
        h: 650,
        title: '',
        url: 'rewrite.so/options',
        children: `
          ${strokeRect(470, 170, 318, 460, 28, '#FFFFFF', '#E4ECE8', 'filter="url(#softShadow)"')}
          ${text('rewrite.so', 522, 226, 30, 810, color.ink)}
          ${pill(522, 252, 'Trigger enabled', color.mint, '#BCEFE7', color.tealDark, 166)}
          ${text('Target language', 522, 322, 17, 760, color.muted)}
          ${strokeRect(522, 344, 214, 48, 14, '#F8FAF8', '#DDE5E2')}
          ${text('Auto-detect page language', 538, 375, 16, 650, color.ink2)}
          ${text('Monthly usage', 522, 446, 17, 760, color.muted)}
          ${rect(522, 468, 214, 12, 6, '#E8EFEC')}
          ${rect(522, 468, 126, 12, 6, color.teal)}
          ${text('Privacy defaults', 522, 548, 17, 760, color.muted)}
          ${text('No stored originals or outputs', 522, 580, 17, 650, color.ink2)}
          ${strokeRect(830, 170, 302, 460, 28, '#F7FFFD', '#BCEFE7', 'filter="url(#softShadow)"')}
          ${text('Excluded fields', 868, 226, 29, 810, color.ink)}
          ${text(['password', 'credit card', 'CVV / CVC', 'OTP codes', 'secret / token', 'readonly / disabled'], 868, 294, 22, 680, color.ink2, { lineHeight: 48 })}
          ${text(['No browsing history.', 'No behavioral advertising.'], 868, 592, 18, 720, color.tealDark, { lineHeight: 30 })}
        `,
      })}
      ${pill(72, 438, 'No ads', '#FFFFFF', '#DDE5E2', color.ink2, 96)}
      ${pill(182, 438, 'No stored rewrites', color.mint, '#BCEFE7', color.tealDark, 178)}
      ${pill(72, 486, 'Sensitive fields excluded', color.peachSoft, '#FFD8C8', '#A74B2F', 236)}
    `,
  });

const promoSmall = () =>
  svg({
    width: 440,
    height: 280,
    body: `
      ${rect(24, 24, 392, 232, 30, 'rgba(255,255,255,0.72)', 'filter="url(#softShadow)"')}
      ${icon(42, 42, 54)}
      ${text('rewrite.so', 110, 72, 24, 820, color.ink)}
      ${pill(268, 52, 'ready to send', color.mint, '#BCEFE7', color.tealDark, 118)}
      ${text(['Write freely.', 'Send confidently.'], 42, 130, 30, 820, color.ink, { lineHeight: 35 })}
      ${promoInput(42, 194, 356, 46, ['make this clearer'], 15)}
    `,
  });

const promoMarquee = () =>
  svg({
    width: 1400,
    height: 560,
    body: `
      ${rect(70, 68, 480, 438, 36, 'rgba(255,255,255,0.70)', 'filter="url(#softShadow)"')}
      ${icon(106, 106, 76)}
      ${text('rewrite.so', 202, 154, 38, 820, color.ink)}
      ${text(['Write freely.', 'Send confidently.'], 104, 246, 48, 820, color.ink, { lineHeight: 56 })}
      ${text(['Rough draft in.', 'Ready message out.'], 108, 392, 24, 620, color.muted, { lineHeight: 34 })}
      ${pill(108, 456, 'faithful', color.blueSoft, '#C7DAFF', '#1D4ED8', 116)}
      ${pill(238, 456, 'casual', color.peachSoft, '#FFD8C8', '#A74B2F', 100)}
      ${pill(352, 456, 'formal', color.mint, '#BCEFE7', color.tealDark, 100)}
      ${browserFrame({
        x: 590,
        y: 64,
        w: 720,
        h: 432,
        title: '',
        children: `
          ${text('Compose', 636, 158, 28, 800, color.ink)}
          ${promoInput(636, 194, 600, 118, ['can you make this clearer', 'before i send it?'], 22)}
          ${downArrow(936, 328, 356)}
          ${promoChoice(668, 368, 536, 'Formal', 'Could you make this clearer before I send it?', color.teal)}
        `,
      })}
    `,
  });

const storeIcon = () => `<?xml version="1.0" encoding="UTF-8"?>
<svg width="128" height="128" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="rewrite.so icon">
  <rect x="16" y="16" width="96" height="96" rx="23" fill="${color.ink}"/>
  <rect x="54.25" y="39.63" width="5.63" height="48.75" rx="2.25" fill="#F4F7FA"/>
  <rect x="69.63" y="76.38" width="10.88" height="10.88" rx="3.75" fill="${color.teal}"/>
</svg>`;

const assets = [
  ['screenshot-01-rewrite-in-place', screenshotRewrite, 1280, 800],
  ['screenshot-02-three-tones', screenshotTones, 1280, 800],
  ['screenshot-03-language-aware', screenshotLanguage, 1280, 800],
  ['screenshot-04-privacy-settings', screenshotPrivacy, 1280, 800],
  ['promo-small-440x280', promoSmall, 440, 280],
  ['promo-marquee-1400x560', promoMarquee, 1400, 560],
  ['store-icon-128', storeIcon, 128, 128],
];

await mkdir(outDir, { recursive: true });

for (const [name, render] of assets) {
  const content = render();
  const svgPath = path.join(outDir, `${name}.svg`);
  const pngPath = path.join(outDir, `${name}.png`);
  await writeFile(svgPath, content, 'utf8');
  await sharp(Buffer.from(content)).png().toFile(pngPath);
  console.log(`generated ${path.relative(process.cwd(), pngPath)}`);
}
