import { resolveSeedLocale } from '../../lib/librarySeeds';
import entemplate0 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/sea-glass.json' with { type: 'json' };
import entemplate1 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/linen.json' with { type: 'json' };
import entemplate2 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/mist.json' with { type: 'json' };
import entemplate3 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/rainy-design-slate.json' with { type: 'json' };
import entemplate4 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/flowing-violet.json' with { type: 'json' };
import entemplate5 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/evening-snow.json' with { type: 'json' };
import entemplate6 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/sunshine.json' with { type: 'json' };
import entemplate7 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/ink-white.json' with { type: 'json' };
import entemplate8 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/flowing-violet-ii.json' with { type: 'json' };
import entemplate9 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/evening-snow-ii.json' with { type: 'json' };
import entemplate10 from '../../../resources/template/fresh-library/en-US/themes/editor-themes/dreaming.json' with { type: 'json' };
import zhtemplate0 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/sea-glass.json' with { type: 'json' };
import zhtemplate1 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/linen.json' with { type: 'json' };
import zhtemplate2 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/mist.json' with { type: 'json' };
import zhtemplate3 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/rainy-design-slate.json' with { type: 'json' };
import zhtemplate4 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/flowing-violet.json' with { type: 'json' };
import zhtemplate5 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/evening-snow.json' with { type: 'json' };
import zhtemplate6 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/sunshine.json' with { type: 'json' };
import zhtemplate7 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/ink-white.json' with { type: 'json' };
import zhtemplate8 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/flowing-violet-ii.json' with { type: 'json' };
import zhtemplate9 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/evening-snow-ii.json' with { type: 'json' };
import zhtemplate10 from '../../../resources/template/fresh-library/zh-CN/themes/editor-themes/dreaming.json' with { type: 'json' };
import legacyMist from '../../../resources/template/compatibility/editor-theme-mist-legacy.json' with { type: 'json' };

const templateSeeds = {
  'en-US': [entemplate0, entemplate1, entemplate2, entemplate3, entemplate4, entemplate5, entemplate6, entemplate7, entemplate8, entemplate9, entemplate10],
  'zh-CN': [zhtemplate0, zhtemplate1, zhtemplate2, zhtemplate3, zhtemplate4, zhtemplate5, zhtemplate6, zhtemplate7, zhtemplate8, zhtemplate9, zhtemplate10],
};
export function getEditorThemeTemplateJson(locale: string = 'en-US') { return templateSeeds[resolveSeedLocale(locale)]; }
export const LEGACY_MIST_THEME_JSON = legacyMist;
