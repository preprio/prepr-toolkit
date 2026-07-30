import { createPreprToolbar, loadTrackingPixel } from '@preprio/toolkit';

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
if (toolbarProps) createPreprToolbar({ props: toolbarProps });
