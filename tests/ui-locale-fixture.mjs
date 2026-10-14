import * as uiFormatters from '../src/lib/i18n/formatters.ts';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import { articleCollectionLabel } from '../src/lib/i18n/articleLabels.ts';
import { themeBindingLabel, themeBindingToken } from '../src/lib/i18n/themeLabels.ts';
import { fontFamily } from '../src/lib/fontCatalog.ts';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import * as editingDrafts from '../src/lib/editingDrafts.ts';
import * as editingLocation from '../src/lib/editingLocation.ts';
import * as sourceLineDiagnostics from '../src/lib/sourceLineDiagnostics.ts';

const instance = createUII18n('zh-CN');
export function withUILocaleImports(resolve) {
  return id => {
    if (id.endsWith('/UILocaleProvider')) return {
      useUITranslation: (namespace = 'common') => ({ t: instance.getFixedT('zh-CN', namespace) }),
      useUILocale: () => ({ locale: 'zh-CN', ready: true }),
    };
    if (id.endsWith('/i18n/articleLabels')) return { articleCollectionLabel };
    if (id.endsWith('/i18n/themeLabels')) return { themeBindingLabel, themeBindingToken };
    if (id.endsWith('/i18n/formatters')) return uiFormatters;
    if (id.endsWith('/i18n/productMessages')) return productMessages;
    if (id.endsWith('/sourceLineDiagnostics')) return sourceLineDiagnostics;
    // Existing VM component tests isolate context and DOM hooks; dedicated draft/location tests exercise their implementation.
    if (id.endsWith('/EditingDrafts')) return { useEditingDraft() {}, useEditingDrafts: () => [], UnsavedMark: 'unsaved-mark', useDraftLocation: () => ({ rootRef: { current: null }, savedRef: { current: null }, capture: () => null, restore() {}, props: {} }) };
    if (id.endsWith('/editingDrafts')) return editingDrafts;
    if (id.endsWith('/editingLocation')) return editingLocation;
    if (id.endsWith('/fontCatalog')) return { fontFamily, ...resolve(id) };
    return resolve(id);
  };
}
