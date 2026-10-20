(() => {
  'use strict';

  const LCD_ID = 'lcd';
  const LCD_W = 128;
  const LCD_H = 64;
  const BG = [217, 229, 181];
  const INK = [21, 33, 22];
  const CJK_RE = /[\u3400-\u9fff]/;

  let quantizePending = false;

  function isLcdContext(ctx) {
    return ctx && ctx.canvas && ctx.canvas.id === LCD_ID &&
      ctx.canvas.width === LCD_W && ctx.canvas.height === LCD_H;
  }

  function quantizeLcd() {
    quantizePending = false;
    const canvas = document.getElementById(LCD_ID);
    if (!canvas || canvas.width !== LCD_W || canvas.height !== LCD_H) return;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const img = ctx.getImageData(0, 0, LCD_W, LCD_H);
    const d = img.data;

    for (let i = 0; i < d.length; i += 4) {
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const inkDistance =
        (r - INK[0]) * (r - INK[0]) +
        (g - INK[1]) * (g - INK[1]) +
        (b - INK[2]) * (b - INK[2]);
      const bgDistance =
        (r - BG[0]) * (r - BG[0]) +
        (g - BG[1]) * (g - BG[1]) +
        (b - BG[2]) * (b - BG[2]);
      const c = inkDistance < bgDistance ? INK : BG;
      d[i] = c[0];
      d[i + 1] = c[1];
      d[i + 2] = c[2];
      d[i + 3] = 255;
    }

    ctx.putImageData(img, 0, 0);
  }

  function scheduleQuantize() {
    if (quantizePending) return;
    quantizePending = true;
    queueMicrotask(quantizeLcd);
  }

  // GRS firmware uses BODY_12 for Chinese settings text and a compact 6x8 face
  // for English. The old Web simulator drew every label with a 6~7 px browser
  // font, which loses too many CJK strokes before the LCD is enlarged.
  const nativeFillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function patchedFillText(text, x, y, maxWidth) {
    const lcd = isLcdContext(this);
    let oldFont;

    if (lcd && CJK_RE.test(String(text))) {
      oldFont = this.font;
      const m = oldFont.match(/(\d+(?:\.\d+)?)px/);
      const requested = m ? Number(m[1]) : 7;
      const size = Math.max(10, requested);
      const weight = /^\s*bold\b/i.test(oldFont) ? 'bold ' : '';
      this.font = `${weight}${size}px "Microsoft YaHei UI","PingFang SC","Noto Sans CJK SC",sans-serif`;
    }

    try {
      if (maxWidth === undefined) nativeFillText.call(this, text, x, y);
      else nativeFillText.call(this, text, x, y, maxWidth);
    } finally {
      if (oldFont !== undefined) this.font = oldFont;
    }

    if (lcd) scheduleQuantize();
  };

  // Quantize once after page initialization as a guard for any drawing that did
  // not contain text. Subsequent app renders are coalesced by the fillText hook.
  window.addEventListener('load', () => {
    const canvas = document.getElementById(LCD_ID);
    if (canvas) {
      canvas.getContext('2d').imageSmoothingEnabled = false;
      scheduleQuantize();
    }
  }, { once: true });
})();
