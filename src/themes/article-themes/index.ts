import { parseThemeConfigJson } from '../../lib/themeValidation';
import { resolveSeedLocale } from '../../lib/librarySeeds';
import enBasicJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/basic.json' with { type: 'json' };
import enRainyJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/rainy.json' with { type: 'json' };
import enQingyanJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/qingyan.json' with { type: 'json' };
import enNuanjianJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/nuanjian.json' with { type: 'json' };
import enMokanJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/mokan.json' with { type: 'json' };
import enJiangyuJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/jiangyu.json' with { type: 'json' };
import enZixuJson from '../../../resources/template/fresh-library/en-US/themes/article-themes/zixu.json' with { type: 'json' };
import zhBasicJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/basic.json' with { type: 'json' };
import zhRainyJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/rainy.json' with { type: 'json' };
import zhQingyanJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/qingyan.json' with { type: 'json' };
import zhNuanjianJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/nuanjian.json' with { type: 'json' };
import zhMokanJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/mokan.json' with { type: 'json' };
import zhJiangyuJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/jiangyu.json' with { type: 'json' };
import zhZixuJson from '../../../resources/template/fresh-library/zh-CN/themes/article-themes/zixu.json' with { type: 'json' };

const themeSeeds = {
  'en-US': [enBasicJson, enRainyJson, enQingyanJson, enNuanjianJson, enMokanJson, enJiangyuJson, enZixuJson].map(source => parseThemeConfigJson(JSON.stringify(source))),
  'zh-CN': [zhBasicJson, zhRainyJson, zhQingyanJson, zhNuanjianJson, zhMokanJson, zhJiangyuJson, zhZixuJson].map(source => parseThemeConfigJson(JSON.stringify(source))),
};

export function getBuiltinArticleThemes(locale: string = 'en-US') {
  return themeSeeds[resolveSeedLocale(locale)];
}

export const THEMES = getBuiltinArticleThemes();
export const BASIC_THEME = THEMES[0];
export const RAINY_THEME = THEMES[1];
export const ARTICLE_THEME_PRESETS = THEMES.slice(2);
