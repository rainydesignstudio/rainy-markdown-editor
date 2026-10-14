import { ProductError, productCause, productText } from "./i18n/productMessages";
import { loadSettingsDocument, updateSettingsDocument } from './settingsFile';
export type ArticleSettings = {
  version: 1;
  defaultArticleThemeId: string | null;
  autoSave: {
    enabled: boolean;
    intervalSeconds: number;
  };
  autoSnapshot: {
    enabled: boolean;
    intervalMinutes: number;
    maxCount: number;
  };
};

export type ArticleSettingsLoadResult = {
  settings: ArticleSettings;
  issue: string | null;
  fileExists: boolean;
};

export const DEFAULT_ARTICLE_SETTINGS: ArticleSettings = Object.freeze({
  version: 1,
  defaultArticleThemeId: null,
  autoSave: Object.freeze({ enabled: true, intervalSeconds: 60 }),
  autoSnapshot: Object.freeze({ enabled: true, intervalMinutes: 30, maxCount: 20 }),
}) as ArticleSettings;

function defaultSettings(): ArticleSettings {
  return {
    version: DEFAULT_ARTICLE_SETTINGS.version,
    defaultArticleThemeId: DEFAULT_ARTICLE_SETTINGS.defaultArticleThemeId,
    autoSave: { ...DEFAULT_ARTICLE_SETTINGS.autoSave },
    autoSnapshot: { ...DEFAULT_ARTICLE_SETTINGS.autoSnapshot },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertOnlyKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const unexpected = Object.keys(value).filter((key) => !expected.includes(key));
  if (unexpected.length) throw new ProductError("articleSettings.containsUnknownFieldsTheFileWasNotRewrittenAutomatically", { "label": label, "details": unexpected.join('、') });
}

function assertInterval(value: unknown, label: string, minimum: number, maximum: number): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ProductError("articleSettings.mustBeAnIntegerIntervalFromTo", { "label": label, "minimum": minimum, "maximum": maximum });
  }
}

export function validateArticleSettings(value: unknown): ArticleSettings {
  if (!isRecord(value)) throw new ProductError("articleSettings.theTopLevelOfSettingsJsonMustBeAnObject");
  assertOnlyKeys(value, ['version', 'defaultArticleThemeId', 'autoSave', 'autoSnapshot'], 'settings.json');
  if (value.version !== 1) throw new ProductError("articleSettings.theSettingsJsonVersionIsUnsupportedTheFileWasNotRewrittenAutomatically");
  if (value.defaultArticleThemeId !== undefined && value.defaultArticleThemeId !== null &&
      (typeof value.defaultArticleThemeId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,47}$/.test(value.defaultArticleThemeId))) {
    throw new ProductError("articleSettings.theDefaultArticleThemeIdIsInvalidTheFileWasNotRewritten");
  }
  if (!isRecord(value.autoSave)) throw new ProductError("articleSettings.theAutosaveFieldInSettingsJsonMustBeAnObject");
  if (!isRecord(value.autoSnapshot)) throw new ProductError("articleSettings.theAutosnapshotFieldInSettingsJsonMustBeAnObject");
  assertOnlyKeys(value.autoSave, ['enabled', 'intervalSeconds'], 'autoSave');
  assertOnlyKeys(value.autoSnapshot, ['enabled', 'intervalMinutes', 'maxCount'], 'autoSnapshot');
  if (typeof value.autoSave.enabled !== 'boolean') throw new ProductError("articleSettings.theAutoSaveSwitchMustBeABoolean");
  if (typeof value.autoSnapshot.enabled !== 'boolean') throw new ProductError("articleSettings.theAutomaticSnapshotSwitchMustBeABoolean");
  assertInterval(value.autoSave.intervalSeconds, productText("articleSettings.autoSaveInterval"), 1, 86_400);
  assertInterval(value.autoSnapshot.intervalMinutes, productText("articleSettings.automaticSnapshotInterval"), 1, 10_080);
  assertInterval(value.autoSnapshot.maxCount, productText("articleSettings.automaticSnapshotRetention"), 1, 100);
  return {
    version: 1,
    defaultArticleThemeId: value.defaultArticleThemeId ?? null,
    autoSave: { enabled: value.autoSave.enabled, intervalSeconds: value.autoSave.intervalSeconds },
    autoSnapshot: {
      enabled: value.autoSnapshot.enabled,
      intervalMinutes: value.autoSnapshot.intervalMinutes,
      maxCount: value.autoSnapshot.maxCount,
    },
  };
}

async function ensureReadWritePermission(root: FileSystemDirectoryHandle): Promise<void> {
  const candidate = root as FileSystemDirectoryHandle & {
    queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
    requestPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>;
  };
  if (!candidate.queryPermission) return;
  const descriptor = { mode: 'readwrite' as const };
  let permission = await candidate.queryPermission(descriptor);
  if (permission !== 'granted' && candidate.requestPermission) permission = await candidate.requestPermission(descriptor);
  if (permission !== 'granted') throw new ProductError("articleSettings.theLibraryLacksReadWritePermissionAuthorizeItAgainToManageSettings");
}

export async function loadArticleSettings(root: FileSystemDirectoryHandle): Promise<ArticleSettingsLoadResult> {
  await ensureReadWritePermission(root);
  try {
    const result = await loadSettingsDocument(root);
    return { settings: result.settings, issue: null, fileExists: result.fileExists };
  } catch (error) {
    return { settings: defaultSettings(), issue: productText("articleSettings.settingsJsonIsInvalidOrUnreadableTheOriginalFileWasNotRewritten", { "cause": productCause(error) }), fileExists: true };
  }
}

export async function saveArticleSettings(root: FileSystemDirectoryHandle, input: ArticleSettings): Promise<ArticleSettings> {
  await ensureReadWritePermission(root);
  const settings = validateArticleSettings(input);
  const saved = await updateSettingsDocument(root, current => ({ ...current, settings }));
  return saved.settings;
}
