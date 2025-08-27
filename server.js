const server = http.createServer((req, res) => {
  const { method, url } = req;
  // Serve index.html and other static assets from the repository root.
  if (method === 'GET') {
    let filePath;
    // Normalize root path to index.html
    if (url === '/' || url === '/index.html') {
      filePath = path.join(__dirname, 'index.html');
    } else {
      // Remove leading slash and map directly to a file in the repo root
      const safeUrl = url.replace(/^\\/+/, '');
      filePath = path.join(__dirname, safeUrl);
    }
    const resolved = path.resolve(filePath);
    // Prevent directory traversal outside the repository root
    if (!resolved.startsWith(path.resolve(__dirname))) {
      sendJson(res, 400, { success: false, message: 'Bad request' });
      return;
    }
    fs.readFile(resolved, (err, data) => {
      if (err) {
        if (url === '/' || url === '/index.html') {
          sendJson(res, 404, { success: false, message: 'UI not found' });
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
        return;
      }
      const ext = path.extname(resolved).toLowerCase();
      const mimes = {
        '.html': 'text/html',
        '.css': 'text/css',
        '.js': 'application/javascript',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg'
      };
      res.writeHead(200, {
        'Content-Type': mimes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
    return;
  }
  // existing POST handler and fallback remain unchanged…
});
