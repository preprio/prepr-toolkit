import { createPreprPreview, loadTrackingPixel } from '@preprio/toolkit';

function readJSON(selector) {
  const el = document.querySelector(selector);
  if (!el?.textContent) return null;
  try {
    return JSON.parse(el.textContent);
  } catch {
    return null;
  }
}

const pixel = readJSON('script[data-prepr-pixel-props]');
if (pixel?.id) loadTrackingPixel(pixel.id);

const toolbarProps = readJSON('script[data-prepr-toolbar-props]');
// Same feature config the server used, so a disabled feature is off both sides.
const toolbarOptions = readJSON('script[data-prepr-toolbar-options]');
if (toolbarProps) {
  createPreprPreview({
    props: toolbarProps,
    options: toolbarOptions ?? undefined,
  });
}
