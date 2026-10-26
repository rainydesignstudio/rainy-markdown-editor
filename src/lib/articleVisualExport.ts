import { ProductError } from "./i18n/productMessages";
import { getFormatSnapshot, getArticleRenderSnapshot, assertCurrentFormat, assertFormatReady } from './article-format/runtime';
import { packageDisplayDocument } from './article-format/packageRendering';

function imageReady(image: HTMLImageElement): Promise<void> {
  if (image.complete && image.naturalWidth > 0) return Promise.resolve();
  return image.decode().then(() => {
    if (!image.naturalWidth) throw new ProductError("articleVisualExport.anArticleImageCouldNotBeDecodedExportStopped");
  });
}

export async function renderArticleExportCanvas(article: HTMLElement, capture?: { width: number; maxCanvasSide: number; background: string }): Promise<{ canvas: HTMLCanvasElement; blockEnds: number[] }> {
  const snapshot = getArticleRenderSnapshot(article); assertFormatReady(snapshot);
  const options = snapshot.bundle.formatter.output.visual;
  const EXPORT_WIDTH = capture?.width ?? options.width;
  const MAX_CANVAS_SIDE = capture?.maxCanvasSide ?? options.maxCanvasSide;
  if (!Number.isInteger(EXPORT_WIDTH) || EXPORT_WIDTH < 1 || EXPORT_WIDTH > 10000 || !Number.isInteger(MAX_CANVAS_SIDE) || MAX_CANVAS_SIDE < 1 || MAX_CANVAS_SIDE > 32767 || capture && !CSS.supports('color', capture.background)) throw new Error('Invalid format capture parameters');
  const originalRoot = article.getRootNode();
  const native = Boolean(snapshot.renderer || snapshot.bundle.formatter.document || snapshot.bundle.formatter.stylesheets);
  if (!native && !(originalRoot instanceof ShadowRoot)) throw new ProductError("articleVisualExport.theArticlePreviewIsNotReadyAnImageCannotBeGenerated");
  const sourceStyle = native ? article.ownerDocument.querySelector<HTMLStyleElement>('style[data-article-style]') : (originalRoot as ShadowRoot).querySelector<HTMLStyleElement>('style[data-article-style]');
  if (!sourceStyle?.textContent) throw new ProductError("articleVisualExport.articleStylesAreNotReadyAnImageCannotBeGenerated");
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-100000px';
  host.style.top = '0';
  host.style.width = `${EXPORT_WIDTH}px`;
  host.style.pointerEvents = 'none';
  document.body.append(host);
  const frame = native ? document.createElement('iframe') : null;
  let packageDocument: Promise<HTMLElement> | undefined;
  if (frame) {
    const viewport = snapshot.bundle.formatter.document?.viewport;
    frame.setAttribute('sandbox', 'allow-same-origin'); frame.style.border = '0';
    frame.style.width = (viewport?.width ?? EXPORT_WIDTH) + 'px'; frame.style.height = (viewport?.height ?? 959) + 'px';
    if (snapshot.renderer) packageDocument = packageDisplayDocument(frame, snapshot);
    host.append(frame);
  }
  const doc = packageDocument ? (await packageDocument.catch(error => { host.remove(); throw error; })).ownerDocument : frame?.contentDocument ?? document;
  if (frame && !snapshot.renderer) { doc.open(); doc.write('<!doctype html><html><head></head><body></body></html>'); doc.close(); }
  const shadow = frame ? doc.body : host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  const preview = snapshot.bundle.formatter.preview;
  style.textContent = native ? 'body{margin:0;font-family:' + preview.fontFamily + ';color:' + preview.color + ';background:' + preview.light.background + '}' + sourceStyle.textContent : sourceStyle.textContent;
  const copy = article.cloneNode(true) as HTMLElement;
  copy.querySelectorAll('[data-preview-only]').forEach(node => node.remove());
  copy.style.width = `${EXPORT_WIDTH}px`;
  copy.style.margin = '0';
  shadow.append(style, copy);
  if (native) { copy.getBoundingClientRect(); await doc.fonts.ready; }
  try {
    if (copy.querySelector('span[data-local-asset-src],span[data-local-asset-srcset]')) {
      throw new ProductError("articleVisualExport.localImagesAreNotLoadedImageAndPdfExportStoppedWaitFor");
    }
    await Promise.all(Array.from(copy.querySelectorAll('img')).map(imageReady));
    const height = Math.ceil(copy.scrollHeight);
    if (!height) throw new ProductError("articleVisualExport.theArticleBodyIsEmptyAnImageCannotBeGenerated");
    if (copy.scrollWidth > EXPORT_WIDTH + 1) throw new ProductError("articleVisualExport.articleContentExceedsTheImageWidthExportStoppedAdjustHorizontalOverflowAnd");
    const pixelRatio = height * 2 <= MAX_CANVAS_SIDE ? 2 : 1;
    if (height * pixelRatio > MAX_CANVAS_SIDE) throw new ProductError("articleVisualExport.theArticleExceedsTheBrowserSSingleImageSizeLimitExportA");
    const top = copy.getBoundingClientRect().top;
    const blockEnds = Array.from(copy.querySelectorAll('p,h1,h2,h3,h4,h5,h6,ul,ol,pre,blockquote,table,section'))
      .map(element => Math.round((element.getBoundingClientRect().bottom - top) * pixelRatio))
      .filter(value => value > 0 && value <= height * pixelRatio)
      .sort((left, right) => left - right);
    let imageFailed = false;
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(copy, {
      width: EXPORT_WIDTH,
      height,
      pixelRatio,
      backgroundColor: capture?.background ?? options.pngBackground,
      skipAutoScale: true,
      onImageErrorHandler: () => { imageFailed = true; },
    });
    if (imageFailed) throw new ProductError("articleVisualExport.anArticleImageOrBackgroundResourceCouldNotLoadExportStopped");
    if (canvas.width !== EXPORT_WIDTH * pixelRatio || canvas.height !== height * pixelRatio) {
      throw new ProductError("articleVisualExport.theBrowserCouldNotDrawTheCompleteArticleExportStopped");
    }
    assertCurrentFormat(snapshot);
    return { canvas, blockEnds };
  } finally {
    host.remove();
  }
}

export async function articleCanvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new ProductError("articleVisualExport.theBrowserDidNotGenerateACompletePngImage")), 'image/png');
  });
}

export function articlePdfPageCuts(height: number, maxPageHeight: number, blockEnds: readonly number[]): number[] {
  const cuts: number[] = [];
  let start = 0;
  while (start < height) {
    const limit = Math.min(height, start + maxPageHeight);
    const minimum = start + Math.round(maxPageHeight * 0.7);
    const preferred = blockEnds.filter(value => value > minimum && value <= limit).at(-1);
    const end = limit < height && preferred ? preferred : limit;
    if (end <= start) throw new ProductError("articleVisualExport.pdfPaginationFailed");
    cuts.push(end);
    start = end;
  }
  return cuts;
}

export async function articleCanvasToPdf(canvas: HTMLCanvasElement, blockEnds: readonly number[], snapshot = getFormatSnapshot()): Promise<Blob> {
  assertFormatReady(snapshot);
  const options = snapshot.bundle.formatter.output.visual;
  const PAGE_MARGIN_PT = options.pdfMargin;
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const imageWidth = pageWidth - PAGE_MARGIN_PT * 2;
  const printableHeight = pageHeight - PAGE_MARGIN_PT * 2;
  if (imageWidth <= 0 || printableHeight <= 0) throw new ProductError("articleVisualExport.pdfMarginsExceedThePageSizeModifyTheFormatterConfiguration");
  const maxPageHeight = Math.max(1, Math.floor(printableHeight * canvas.width / imageWidth));
  const cuts = articlePdfPageCuts(canvas.height, maxPageHeight, blockEnds);
  let start = 0;
  for (let index = 0; index < cuts.length; index += 1) {
    const end = cuts[index];
    const slice = document.createElement('canvas');
    slice.width = canvas.width;
    slice.height = end - start;
    const context = slice.getContext('2d');
    if (!context) throw new ProductError("articleVisualExport.theBrowserHasNoUsablePdfDrawingCanvas");
    context.fillStyle = options.pdfBackground;
    context.fillRect(0, 0, slice.width, slice.height);
    context.drawImage(canvas, 0, start, canvas.width, slice.height, 0, 0, slice.width, slice.height);
    if (index) pdf.addPage();
    pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', PAGE_MARGIN_PT, PAGE_MARGIN_PT, imageWidth, slice.height * imageWidth / canvas.width);
    start = end;
  }
  assertCurrentFormat(snapshot);
  return pdf.output('blob');
}
