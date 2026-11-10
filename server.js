const http = require('node:http');
const db = require('./database');

const { handleWordbankSync } = require("./wordbank-sync");


const HOST = '100.87.150.51';
const PORT = 3000;

// Helper function for JSON responses.
function sendJSON(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });

  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {

  const pathname = new URL(req.url, 'http://localhost').pathname;


  if (pathname === "/wordbank") {
    void handleWordbankSync(req, res);
    return;
  }

  // GET: Retrieve all saved tokens.
  if (req.method === 'GET' && pathname === '/tokens') {

    const tokens = db.prepare(`
      SELECT * FROM tokens ORDER BY id DESC
    `).all();

    return sendJSON(res, 200, tokens);
  }

  // GET: Retrieve translations.
  if (req.method === 'GET' && pathname === '/translations') {

    const translations = db.prepare(`
      SELECT * FROM translations ORDER BY id DESC
    `).all();

    return sendJSON(res, 200, translations);
  }

  // POST: Save a token or translation.
  if (req.method === 'POST' &&
      (pathname === '/tokens' || pathname === '/translations')) {

    let body = '';
    let tooLarge = false;

    req.on('data', chunk => {
      body += chunk;

      if (body.length > 16000) {
        tooLarge = true;
        req.destroy();
      }
    });

    req.on('end', () => {
      if (tooLarge) return;

      let data;

      try {
        data = JSON.parse(body);
      } catch {
        return sendJSON(res, 400, {
          error: 'Invalid JSON'
        });
      }

      if (!data || typeof data !== 'object') {
        return sendJSON(res, 400, {
          error: 'Expected a JSON object'
        });
      }

      if (pathname === '/tokens') {

        const { text, source_language, source_url = null } = data;

        if (typeof text !== 'string' || !text.trim() ||
            typeof source_language !== 'string' ||
            !source_language.trim() ||
            (source_url !== null && typeof source_url !== 'string')) {
          return sendJSON(res, 400, {
            error: 'Invalid token data'
          });
        }

        const result = db.prepare(`
          INSERT INTO tokens (text, source_language, source_url)
          VALUES (?, ?, ?)
        `).run(text, source_language, source_url);

        return sendJSON(res, 201, {
          message: 'Token saved!',
          id: Number(result.lastInsertRowid)
        });
      }

      const { token_id, target_language, translated_text } = data;

      if (!Number.isSafeInteger(token_id) || token_id < 1 ||
          typeof target_language !== 'string' ||
          !target_language.trim() ||
          typeof translated_text !== 'string' ||
          !translated_text.trim()) {
        return sendJSON(res, 400, {
          error: 'Invalid translation data'
        });
      }

      try {
        const result = db.prepare(`
          INSERT INTO translations
          (token_id, target_language, translated_text)
          VALUES (?, ?, ?)
        `).run(token_id, target_language, translated_text);

        return sendJSON(res, 201, {
          message: 'Translation saved!',
          id: Number(result.lastInsertRowid)
        });

      } catch {
        return sendJSON(res, 400, {
          error: 'Could not save translation. Check token_id.'
        });
      }
    });

    return;
  }

  // Homepage.
  if (req.method === 'GET' && pathname === '/') {
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8'
    });

    return res.end(`
      <h1>Welcome to Wordbank! 🩷</h1>
      <p>Our translation database is connected!</p>
    `);
  }

  sendJSON(res, 404, { error: 'Not found' });
});

server.listen(PORT, HOST, () => {
  console.log(`Wordbank running at http://${HOST}:${PORT}`);
});
