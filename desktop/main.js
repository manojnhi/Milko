const { app, BrowserWindow, dialog, ipcMain, shell, session } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

// IMPORTANT: web database (OPFS) origin = host + PORT se juda hai. Port badla to app khali database dikhata hai.
// Isliye port hamesha fixed hai; busy ho to random port par fallback NAHI karna.
const PORT = 47831;
const ORIGIN = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.otf': 'font/otf', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

// packaged: resources/web, dev: ../dist
const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'dist');

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let file;
      try {
        file = path.join(webRoot, decodeURIComponent(req.url.split('?')[0]));
      } catch {
        res.writeHead(400);
        return res.end();
      }
      if (!file.startsWith(webRoot + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(webRoot, 'index.html');
      }
      // SQLite wasm ko SharedArrayBuffer chahiye -> cross-origin isolation headers
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).on('error', () => res.end()).pipe(res);
    });
    server.once('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

ipcMain.handle('milko:save-pdf', async (event, { html, name, landscape }) => {
  if (!event.senderFrame.url.startsWith(ORIGIN)) throw new Error('Not allowed');
  const target = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender), {
    defaultPath: path.join(app.getPath('documents'), path.basename(String(name))),
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  });
  if (target.canceled) return;
  const dir = fs.mkdtempSync(path.join(app.getPath('temp'), 'milko-'));
  const printer = new BrowserWindow({ show: false, webPreferences: { javascript: false, sandbox: true } });
  try {
    const page = path.join(dir, 'report.html');
    fs.writeFileSync(page, String(html), 'utf8');
    await printer.loadFile(page);
    const pdf = await printer.webContents.printToPDF({ pageSize: 'A4', landscape: !!landscape, printBackground: true, preferCSSPageSize: true });
    fs.writeFileSync(target.filePath, pdf);
  } finally {
    printer.destroy();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

let win;
// Ek hi window/instance: do instance ek database ko lock kar dete hain.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(async () => {
    try {
      await startServer();
    } catch (e) {
      dialog.showErrorBox('Milko could not start', `Port ${PORT} is being used by another program. Close it and open Milko again.\nYour data is safe.\n\n${e.message}`);
      return app.quit();
    }
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
    win = new BrowserWindow({
      width: 1200, height: 800, minWidth: 380, minHeight: 600, title: 'Milko', autoHideMenuBar: true, icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) shell.openExternal(url);
      return { action: 'deny' };
    });
    win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith(ORIGIN)) e.preventDefault(); });
    win.loadURL(`${ORIGIN}/`);
  });
}
app.on('window-all-closed', () => app.quit());
