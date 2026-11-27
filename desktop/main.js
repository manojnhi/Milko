const { app, BrowserWindow } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.wasm': 'application/wasm', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.svg': 'image/svg+xml',
};

// packaged: resources/web, dev: ../dist
const webRoot = app.isPackaged ? path.join(process.resourcesPath, 'web') : path.join(__dirname, '..', 'dist');

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let p = decodeURIComponent(req.url.split('?')[0]);
      let file = path.join(webRoot, p);
      if (!file.startsWith(webRoot) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(webRoot, 'index.html');
      }
      // SQLite wasm ko SharedArrayBuffer chahiye -> cross-origin isolation headers
      res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
      res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
      res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

app.whenReady().then(async () => {
  const port = await startServer();
  const win = new BrowserWindow({ width: 480, height: 820, title: 'Milko', autoHideMenuBar: true });
  win.loadURL(`http://127.0.0.1:${port}/`);
});
app.on('window-all-closed', () => app.quit());
