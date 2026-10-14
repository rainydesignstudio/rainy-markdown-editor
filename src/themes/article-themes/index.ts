import { parseThemeConfigJson } from '../../lib/themeValidation';
import basicJson from '../../../resources/template/fresh-library/themes/article-themes/basic.json' with { type: 'json' };
import rainyJson from '../../../resources/template/fresh-library/themes/article-themes/rainy.json' with { type: 'json' };
import qingyanJson from '../../../resources/template/fresh-library/themes/article-themes/qingyan.json' with { type: 'json' };
import nuanjianJson from '../../../resources/template/fresh-library/themes/article-themes/nuanjian.json' with { type: 'json' };
import mokanJson from '../../../resources/template/fresh-library/themes/article-themes/mokan.json' with { type: 'json' };
import jiangyuJson from '../../../resources/template/fresh-library/themes/article-themes/jiangyu.json' with { type: 'json' };
import zixuJson from '../../../resources/template/fresh-library/themes/article-themes/zixu.json' with { type: 'json' };

export const BASIC_THEME = parseThemeConfigJson(JSON.stringify(basicJson));
export const RAINY_THEME = parseThemeConfigJson(JSON.stringify(rainyJson));
export const ARTICLE_THEME_PRESETS = [qingyanJson, nuanjianJson, mokanJson, jiangyuJson, zixuJson]
  .map(source => parseThemeConfigJson(JSON.stringify(source)));
export const THEMES = [BASIC_THEME, RAINY_THEME, ...ARTICLE_THEME_PRESETS];
