/**
 * Mobile PDF preview cannot use a browser/plugin iframe or a raw WebView URI.
 * iOS Safari, Chrome mobile, and WKWebView leave those blank — especially blob:
 * and private Storage URLs. Rasterize with pdf.js instead.
 */

export const MOBILE_PDF_JS_VER = "3.11.174";
export const MOBILE_PDF_JS_SRC = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${MOBILE_PDF_JS_VER}/pdf.min.js`;
export const MOBILE_PDF_JS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${MOBILE_PDF_JS_VER}/pdf.worker.min.js`;
export const MOBILE_PDF_PAGE_CAP = 40;

export function shouldRasterizePdfForViewport(env?: {
  userAgent?: string;
  maxTouchPoints?: number;
  width?: number;
  uri?: string;
}): boolean {
  const uri = env?.uri ?? "";
  // Safari (desktop too) and every blob: URL fail in an <iframe type=pdf>.
  if (/^(blob:|data:)/i.test(uri)) return true;
  const ua =
    env?.userAgent ??
    (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const touch =
    env?.maxTouchPoints ??
    (typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0);
  const width =
    env?.width ??
    (typeof window !== "undefined" ? window.innerWidth : 1024);
  const ios =
    /iPad|iPhone|iPod/i.test(ua) ||
    (/Macintosh/i.test(ua) && touch > 1);
  const safari =
    /safari/i.test(ua) && !/chrome|chromium|crios|fxios|edg|android/i.test(ua);
  const androidPhone = /Android/i.test(ua) && /Mobile/i.test(ua);
  return safari || ios || androidPhone || width <= 767;
}

export function uint8ToBase64(bytes: Uint8Array): string {
  const chunk = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  if (typeof globalThis.btoa !== "function") {
    throw new Error("Could not encode PDF for preview.");
  }
  return globalThis.btoa(binary);
}

/** Self-contained pdf.js page stack for native WebView (no iframe / plugin). */
export function nativePdfViewerHtml(base64: string): string {
  const payload = JSON.stringify(base64);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, minimum-scale=0.5, maximum-scale=4, user-scalable=yes" />
  <style>
    html, body { margin: 0; padding: 0; background: #f4f4f5; }
    #pages { padding: 8px 8px 24px; }
    canvas { display: block; width: 100%; height: auto; margin: 0 0 10px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
    #err { padding: 24px 16px; font: 14px/1.4 -apple-system, sans-serif; color: #52525b; text-align: center; }
  </style>
  <script src="${MOBILE_PDF_JS_SRC}"></script>
</head>
<body>
  <div id="pages"></div>
  <script>
    (function () {
      var root = document.getElementById("pages");
      function fail(msg) {
        var el = document.createElement("div");
        el.id = "err";
        el.textContent = msg || "Could not open this PDF.";
        document.body.appendChild(el);
      }
      if (!window.pdfjsLib) { fail(); return; }
      pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(MOBILE_PDF_JS_WORKER)};
      var raw = atob(${payload});
      var bytes = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      pdfjsLib.getDocument({ data: bytes }).promise.then(function (doc) {
        var width = Math.max(document.body.clientWidth || 320, 280);
        var max = Math.min(doc.numPages, ${MOBILE_PDF_PAGE_CAP});
        function paint(index) {
          if (index > max) return Promise.resolve();
          return doc.getPage(index).then(function (page) {
            var base = page.getViewport({ scale: 1 });
            var scale = Math.min(2, width / base.width);
            var vp = page.getViewport({ scale: Math.max(0.4, scale) });
            var canvas = document.createElement("canvas");
            canvas.width = Math.max(1, Math.ceil(vp.width));
            canvas.height = Math.max(1, Math.ceil(vp.height));
            canvas.setAttribute("aria-label", "Page " + index);
            root.appendChild(canvas);
            return page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise.then(function () {
              return paint(index + 1);
            });
          });
        }
        return paint(1);
      }).catch(function () { fail(); });
    })();
  </script>
</body>
</html>`;
}
