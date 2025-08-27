const http = require('http');
const fs = require('fs');
const path = require('path');

// URLs for redirecting users
const BOOKING_URL = 'https://ai.henigan.io/picture';
const SELFPAY_URL = 'https://www.albertplasticsurgery.com/patient-resources/financing/';

// Serve static files from the project root
function serveStatic(req, res) {
  // Normalize URL: '/' becomes '/index.html'
  let reqPath = req.url === '/' ? '/index.html' : req.url;
  const filePath = path.join(__dirname, reqPath);
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).substring(1);
    const mime = {
      html: 'text/html',
      js: 'text/javascript',
      css: 'text/css',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif'
    }[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  } catch (err) {
    res.writeHead(404);
    res.end('Not found');
  }
}

// Handle POST requests to /submit
function handleSubmit(req, res) {
  let body = '';
  req.on('data', chunk => (body += chunk));
  req.on('end', () => {
    try {
      const { front, back, planType } = JSON.parse(body);
      if (!front || !back) {
        res.end(JSON.stringify({ success: false, message: 'Front and back images are required.' }));
        return;
      }
      // Accept only PPO or POS plans
      if (planType && ['PPO', 'POS'].includes(planType.toUpperCase())) {
        res.end(
          JSON.stringify({
            success: true,
            message: 'You’re eligible to move forward.',
            link: BOOKING_URL
          })
        );
      } else {
        res.end(
          JSON.stringify({
            success: false,
            message: 'Unfortunately, your insurance is not eligible for coverage at Dr. Albert’s office. We’re going to redirect you to our self-pay option.',
            link: SELFPAY_URL
          })
        );
      }
    } catch (err) {
      console.error(err);
      res.end(JSON.stringify({ success: false, message: 'Server error.' }));
    }
  });
}

// Create HTTP server
const server = http.createServer((req, res) => {
  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }
  if (req.method === 'POST' && req.url === '/submit') {
    handleSubmit(req, res);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
