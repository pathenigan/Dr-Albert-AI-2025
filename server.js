/*
     * Node HTTP server for Dr. Albert insurance verification using OCR.
     *
     * This server uses tesseract.js to extract text from the uploaded
     * images of an insurance card. It then tries to determine whether the
     * plan is PPO, POS, HMO, or EPO and whether out‑of‑network benefits
     * are available. The logic rejects non‑commercial plans (e.g.
     * Medicare/Medicaid) and plans that are ambiguous or conflict with
     * multiple plan types. Only PPO and POS are accepted as having OON
     * benefits. When eligible, the user is redirected to the booking page.
     */

    const http = require('http');
    const fs = require('fs');
    const path = require('path');
    const { createWorker } = require('tesseract.js');

    const BOOKING_URL = 'https://ai.henigan.io/picture';
    const SELFPAY_URL = 'https://www.albertplasticsurgery.com/patient-resources/financing/';

    // Set up a single Tesseract worker. We reuse it across requests to
    // avoid the overhead of reloading models each time.
    const worker = createWorker({ logger: m => console.log(m) });
    let workerReady = false;
    async function ensureWorker() {
      if (!workerReady) {
        // tesseract.js v5 no longer exposes worker.load()
        await worker.loadLanguage('eng');
        await worker.initialize('eng');
        workerReady = true;
      }
    }

    function sendJson(res, status, obj) {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(obj));
    }

    // Normalize text by removing non‑alphanumeric characters and uppercasing.
    function normalize(text) {
      return text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }

    // Parse the extracted text to identify plan type and out‑of‑network
    // availability. Returns an object { planType, hasOON, conflict }.
    function parsePlan(rawText) {
      const up = rawText.toUpperCase();
      const collapsed = normalize(rawText);
      const hasPPO = /\bPPO\b/.test(up) || collapsed.includes('PPO') || 
collapsed.includes('PREFERREDPROVIDERORGANIZATION');
      const hasPOS = /\bPOS\b/.test(up) || collapsed.includes('POS') || collapsed.includes('POINTOFSERVICE');
      const hasHMO = /\bHMO\b/.test(up) || collapsed.includes('HMO') || 
collapsed.includes('HEALTHMAINTENANCEORGANIZATION');
      const hasEPO = /\bEPO\b/.test(up) || collapsed.includes('EPO') || 
collapsed.includes('EXCLUSIVEPROVIDERORGANIZATION');
      const hasMedicare = collapsed.includes('MEDICARE');
      const hasMedicaid = collapsed.includes('MEDICAID');
      const hasOther = collapsed.includes('TRICARE') || collapsed.includes('VETERANS') || collapsed.includes('VA') || 
collapsed.includes('CATASTROPHIC');
      if (hasMedicare || hasMedicaid || hasOther) {
        return { planType: 'NON-COMMERCIAL', hasOON: false, conflict: true };
      }
      const flags = [hasPPO, hasPOS, hasHMO, hasEPO];
      const count = flags.filter(Boolean).length;
      if (count !== 1) {
        return { planType: count === 0 ? 'UNKNOWN' : 'CONFLICT', hasOON: false, conflict: true };
      }
      let planType;
      let hasOON;
      if (hasPPO) { planType = 'PPO'; hasOON = true; }
      else if (hasPOS) { planType = 'POS'; hasOON = true; }
      else if (hasHMO) { planType = 'HMO'; hasOON = false; }
      else { planType = 'EPO'; hasOON = false; }
      return { planType, hasOON, conflict: false };
    }

    async function ocr(buffer) {
      await ensureWorker();
      const { data: { text } } = await worker.recognize(buffer);
      return text;
    }

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
          const safeUrl = url.replace(/^\/+/, '');
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
            '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg'
          };
          res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream', 'Cache-Control': 'no-store' });
          res.end(data);
        });
        return;
      }
      // Handle card submission for OCR processing.
      if (method === 'POST' && (url === '/submit' || url === '/api/submit')) {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const { front, back } = JSON.parse(body);
            if (!front || !back) {
              sendJson(res, 400, { success: false, message: 'Missing images' });
              return;
            }
            const frontBuf = Buffer.from(front, 'base64');
            const backBuf = Buffer.from(back, 'base64');
            const [frontText, backText] = await Promise.all([ocr(frontBuf), ocr(backBuf)]);
            const plan = parsePlan(`${frontText}\n${backText}`);
            if (plan.conflict || !plan.hasOON) {
              sendJson(res, 200, {
                success: false,
                message: `Unfortunately, your insurance is not eligible for coverage at Dr. Albert’s office. You can 
still book a self-pay consultation here: ${SELFPAY_URL}`,
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
      // Fallback 404
      res.writeHead(404);
      res.end('Not found');
    });

    module.exports = server;

    // If run directly (node server.js) start listening on the provided port
    if (require.main === module) {
      const port = process.env.PORT || 3000;
      server.listen(port, () => {
        console.log('Server listening on port', port);
      });
    }
