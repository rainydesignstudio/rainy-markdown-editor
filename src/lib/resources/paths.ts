/** One encoding for filenames used in Markdown destinations and HTML attributes. */
export function encodeResourceLeaf(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
}
