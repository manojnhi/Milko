// Browser aur Electron desktop. Metro web build me files.js ki jagah ye file leta hai.
const desktop = () => (typeof window !== 'undefined' ? window.milkoDesktop : undefined);

export const pdfMode = typeof window !== 'undefined' && window.milkoDesktop ? 'download' : 'print';

export async function saveFile(name, content, mimeType) {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function pickFile(maxBytes) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls,.json,.txt';
    input.style.display = 'none';
    const done = () => input.remove();
    input.oncancel = () => { done(); resolve(null); };
    input.onchange = async () => {
      const file = input.files?.[0];
      done();
      if (!file) return resolve(null);
      if (file.size > maxBytes) return reject(new Error(`File is too large (max ${Math.round(maxBytes / 1048576)} MB)`));
      try { resolve({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) }); }
      catch (e) { reject(e); }
    };
    document.body.appendChild(input);
    input.click();
  });
}

export function printHtml(html) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    frame.onload = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        resolve();
      } catch (e) { reject(e); }
      setTimeout(() => frame.remove(), 60000);
    };
    frame.srcdoc = html;
    document.body.appendChild(frame);
  });
}

/** Desktop: asli PDF file save. Browser: print dialog me "Save as PDF" chunna hota hai. */
export async function savePdf(html, name, landscape) {
  if (desktop()) return desktop().savePdf(html, name, !!landscape);
  return printHtml(html);
}
