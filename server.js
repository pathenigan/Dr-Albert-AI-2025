/**
 * Dr-Albert-AI-2025 server
 * Static UI + OCR endpoint using tesseract.js
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const Tesseract = require('tesseract.js');

const BOOKING_URL = 'https://ai.henigan.io/picture';
const SELFPAY_URL = 'https://www.albertplasticsurgery.com/patient-resources/financing/';

// JSON helper
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
}

// Normalize text to help the simple rules below
function normalize(text) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Heuristic plan parser
function parsePlan(rawText) {
  const up = rawText.toUpperCase();
  const collapsed = normalize(rawText);

  const hasPPO = /\bPPO\b/.test(up) || collapsed.includes('PPO') || collapsed.includes('PREFERREDPROVIDERORGANIZATION');
  const hasPOS = /\bPOS\b/.test(up) || collapsed.includes('POS') || collapsed.includes('POINTOFSERVICE');
  const hasHMO = /\bHMO\b/.test(up) || collapsed.includes('HMO') || collapsed.includes('HEALTHMAINTENANCEORGANIZATION');
  const hasEPO = /\bEPO\b/.test(up) || collapsed.includes('EPO') || collapsed.includes('EXCLUSIVEPROVIDERORGANIZATION');

  const hasMedicare = collapsed.includes('MEDICARE');
  const hasMedicaid = collapsed.includes('MEDICAID');
  const hasOther = collapsed.includes('TRICARE') || collapsed.includes('VETERANS') || collapsed.includes('VA') || collapsed.includes('CATASTROPHIC');

  if (hasMedicare || hasMedicaid || hasOther) {
    return { planType: 'NON-COMMERCIAL', hasOON: false, conflict: true };
  }

  const flags = [hasPPO, hasPOS, hasHMO, hasEPO];
  const count = flags.filter(Boolean).length;
  if (count !== 1) {
    return { planType: count === 0 ? 'UNKNOWN' : 'CONFLICT', hasOON: false, conflict: true };
  }

  let planType, hasOON;
  if (hasPPO) { planType = 'PPO'; hasOON = true; }
  else if (hasPOS) { planType = 'POS'; hasOON = true; }
  else if (hasHMO) { planType = 'HMO'; hasOON = false; }
  else { planType = 'EPO'; hasOON = false; }

  return { planType, hasOON, conflict: false };
}

// OCR using the static API. No worker.load or loadLanguage calls.
async function ocr(buffer) {
  const opts = {
    logger: m => console.log(m),
    // If you later bundle traineddata, set TESSDATA_PREFIX to that folder in Render.
    // Default here uses the official CDN for v5 traineddata.
    langPath: process.env.TESSDATA_PREFIX || 'https://tessdata.projectnaptha.com/5/'
  };
  const { data: { text } } = await Tesseract.recognize(buffer, 'eng', opts);
  return text;
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  // Serve static assets from repo root
  if (method === 'GET') {
    let filePath;
    if (url === '/' || url === '/index.html') {
      filePath = path.join(__dirname, 'index.html');
    } else {
      const safeUrl = url.replace(/^\/+/, '');
      filePath = path.join(__dirname, safeUrl);
    }

    const resolved = path.resolve(filePath);
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
        '.jpeg': 'image/jpeg',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon'
      };

      res.writeHead(200, {
        'Content-Type': mimes[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store'
      });
      res.end(data);
    });
    return;
  }

  // OCR endpoint
  if (method === 'POST' && (url === '/submit' || url === '/api/submit')) {
    let body = '';
    let bytes = 0;
    const MAX = 15 * 1024 * 1024; // basic guardrail for very large uploads

    req.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > MAX) {
        req.destroy();
      } else {
        body += chunk;
      }
    });

    req.on('end', async () => {
      try {
        const { front, back } = JSON.parse(body || '{}');
        if (!front || !back) {
          sendJson(res, 400, { success: false, message: 'Missing images' });
          return;
        }

        const frontBuf = Buffer.from(front, 'base64');
        const backBuf = Buffer.from(back, 'base64');

        const [frontText, backText] = await Promise.all([
          ocr(frontBuf),
          ocr(backBuf)
        ]);

        const plan = parsePlan(`${frontText}\n${backText}`);

        if (plan.conflict || !plan.hasOON) {
          sendJson(res, 200, {
            success: false,
            message: `Unfortunately, your insurance is not eligible for coverage at Dr. Albert’s office. You can still book a self-pay consultation here: ${SELFPAY_URL}`,
            details: plan
          });
        } else {
          sendJson(res, 200, {
            success: true,
            message: 'You’re eligible to move forward.',
            link: BOOKING_URL,
            details: plan
          });
        }
      } catch (err) {
        console.error(err);
        sendJson(res, 500, { success: false, message: 'Server error' });
      }
    });

    return;
  }

  // Fallback
  res.writeHead(404);
  res.end('Not found');
});

module.exports = server;

// Start server if executed directly
if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    console.log('Server listening on port', port);
  });
}
