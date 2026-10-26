/** Collection IDs, rather than translated text, distinguish product collections from user project names. */
export function articleCollectionLabel(collection: string, storedTitle: string, translate: (key: string) => string): string {
  return collection === 'trash' ? translate('messages:trash.title') : ['all', 'unclassified', 'archived'].includes(collection) ? translate('articles:collections.' + collection) : storedTitle;
}
