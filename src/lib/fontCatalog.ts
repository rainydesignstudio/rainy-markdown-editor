import { productText } from "./i18n/productMessages";
import manifest from '../../resources/font-sources.json' with { type: 'json' };
export const SYSTEM_UI_FONT = '"PingFang SC", "Microsoft YaHei", system-ui, sans-serif';
export const SYSTEM_SERIF_FONT = '"Songti SC", SimSun, "Noto Serif CJK SC", "Source Han Serif SC", serif';
export const SYSTEM_CODE_FONT = '"SFMono-Regular", Consolas, "Liberation Mono", monospace';

export const OPEN_FONT_ASSETS = manifest.fonts;

const CATALOG = [
  { family: 'PingFang SC', label: productText("fontCatalog.systemSansPingfangMicrosoftYahei"), stack: SYSTEM_UI_FONT, code: false },
  { family: 'Songti SC', label: productText("fontCatalog.systemSerifSongtiSimsun"), stack: SYSTEM_SERIF_FONT, code: false },
  { family: 'SFMono-Regular', label: productText("fontCatalog.systemCodeSfMonoConsolas"), stack: SYSTEM_CODE_FONT, code: true },
  { family: 'Sen Local', label: productText("fontCatalog.senLocalOpenFont"), stack: '"Sen Local", "Noto Sans SC Local", "PingFang SC", "Microsoft YaHei", sans-serif', code: false },
  { family: 'Noto Sans SC Local', label: productText("fontCatalog.notoSansScLocalOpenFont"), stack: '"Noto Sans SC Local", "PingFang SC", "Microsoft YaHei", sans-serif', code: false },
  { family: 'Roboto Mono Local', label: productText("fontCatalog.robotoMonoLocalOpenCodeFont"), stack: '"Roboto Mono Local", "Noto Sans SC Local", monospace', code: true },
];

export function fontFamily(stack: string): string { return stack.split(',')[0].trim().replace(/^['"]|['"]$/g, ''); }
function catalogFont(stack: string) {
  const family = fontFamily(stack).toLowerCase();
  if (['system-ui', 'ui-sans-serif', 'sans-serif', 'microsoft yahei'].includes(family)) return CATALOG[0];
  if (['serif', 'simsun', 'ui-serif'].includes(family)) return CATALOG[1];
  if (['monospace', 'ui-monospace', 'consolas'].includes(family)) return CATALOG[2];
  return CATALOG.find(font => font.family.toLowerCase() === family);
}
export function canonicalFontStack(stack: string): string { return catalogFont(stack)?.stack ?? stack; }
export function codeFontStack(stack: string): string {
  const font = catalogFont(stack);
  return font?.code ? canonicalFontStack(stack) : !font && /\bmonospace\b/.test(stack) ? stack : SYSTEM_CODE_FONT;
}

// One option per family; fallback stacks are implementation details, not duplicate choices.
export function fontOptions(stacks: readonly string[], codeOnly = false) {
  const options = new Map(CATALOG.filter(font => !codeOnly || font.code).map(font => [font.family.toLowerCase(), { label: font.label, value: font.stack }]));
  for (const stack of stacks) {
    if (catalogFont(stack) || (codeOnly && !/\bmonospace\b/.test(stack))) continue;
    const family = fontFamily(stack);
    if (!options.has(family.toLowerCase())) options.set(family.toLowerCase(), { label: family, value: stack });
  }
  return [...options.values()];
}
