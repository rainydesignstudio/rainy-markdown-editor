import type { TFunction } from 'i18next';
import { formatProductMessage } from '../i18n/productMessages';

const viewKeys = new Set(['researchInvalid', 'researchChanged', 'researchTooLarge', 'contentTruncated']);
export function formatKnowledgeIssue(issue: unknown, t: TFunction): string {
  const message = formatProductMessage(issue, t);
  return viewKeys.has(message) ? t(message) : message;
}
