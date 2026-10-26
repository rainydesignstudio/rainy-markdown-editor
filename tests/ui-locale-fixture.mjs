import * as articleListSorting from '../src/lib/articleListSorting.ts';
import * as feedback from '../src/lib/i18n/feedback.ts';
import * as uiFormatters from '../src/lib/i18n/formatters.ts';
import { createUII18n } from '../src/lib/i18n/runtime.ts';
import { articleCollectionLabel } from '../src/lib/i18n/articleLabels.ts';
import { themeBindingLabel, themeBindingToken } from '../src/lib/i18n/themeLabels.ts';
import { fontFamily } from '../src/lib/fontCatalog.ts';
import * as productMessages from '../src/lib/i18n/productMessages.ts';
import * as editingDrafts from '../src/lib/editingDrafts.ts';
import * as editingLocation from '../src/lib/editingLocation.ts';
import * as sourceLineDiagnostics from '../src/lib/sourceLineDiagnostics.ts';
import { getFormatSnapshot } from '../src/lib/article-format/runtime.ts';
import * as libraryConfiguration from '../src/lib/article-format/libraryConfiguration.ts';

const instance = createUII18n('zh-CN');
export function withUILocaleImports(resolve) {
  return id => {
    if (id.endsWith('/PreviewCssDetails')) return { PreviewCssDetails: 'preview-css-details' };
    if (id.endsWith('/OperationFeedback')) return { OperationFeedback: 'operation-feedback' };
    if (id.endsWith('/articleListSorting')) return articleListSorting;
    if (id.endsWith('/i18n/feedback')) return feedback;
    if (id.endsWith('/useMediaReferences')) return { useMediaReferences: () => ({ states: undefined, pending: false, issue: null }) };
    if (id.endsWith('/MediaArticleNavigation')) return { MediaArticleNavigation: 'article-navigation' };
    if (id.endsWith('/SelectField')) return { SelectField: 'select-field' };
    if (id.endsWith('/LibraryCard')) return { LibraryCard: 'button', LibraryCardFrame: 'article', LibraryCardGrid: 'div' };
    if (id.endsWith('/ContentIcon')) return { ContentIcon: 'svg' };
    if (id.endsWith('/UILocaleProvider')) return {
      useUITranslation: (namespace = 'common') => ({ t: instance.getFixedT('zh-CN', namespace) }),
      useUILocale: () => ({ locale: 'zh-CN', ready: true }),
    };
    if (id.endsWith('/i18n/articleLabels')) return { articleCollectionLabel };
    if (id.endsWith('/i18n/themeLabels')) return { themeBindingLabel, themeBindingToken };
    if (id.endsWith('/i18n/formatters')) return uiFormatters;
    if (id.endsWith('/i18n/productMessages')) return productMessages;
    if (id.endsWith('/article-format/libraryConfiguration')) return libraryConfiguration;
    if (id.endsWith('/useLibraryCapability')) {
      const get = key => {
      const state = libraryConfiguration.libraryCapability(getFormatSnapshot(), key);
      return { enabled: state.enabled, reason: state.reason ? productMessages.formatProductMessage(state.reason, instance.getFixedT('zh-CN', 'messages')) : undefined };
      };
      return { useLibraryCapability: get, useLibraryCapabilities: () => ({ get }) };
    }
    if (id.endsWith('/sourceLineDiagnostics')) return sourceLineDiagnostics;
    // Existing VM component tests isolate context and DOM hooks; dedicated draft/location tests exercise their implementation.
    if (id.endsWith('/EditingDrafts')) return { useEditingDraft() {}, useEditingDrafts: () => [], UnsavedMark: 'unsaved-mark', useDraftLocation: () => ({ rootRef: { current: null }, savedRef: { current: null }, capture: () => null, restore() {}, props: {} }) };
    if (id.endsWith('/editingDrafts')) return editingDrafts;
    if (id.endsWith('/editingLocation')) return editingLocation;
    if (id.endsWith('/fontCatalog')) return { fontFamily, ...resolve(id) };
    return resolve(id);
  };
}
