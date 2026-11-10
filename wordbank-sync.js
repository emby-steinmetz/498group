
const databaseModule = require('./database');
const db = databaseModule.db ?? databaseModule;

// Accept tokens issued to either of our OAuth applications.
const ALLOWED_GOOGLE_CLIENT_IDS = new Set([
  // Original Chrome Extension OAuth client
  '259897327569-ref8gbopv2d111uj90q8b5qi00sp7i4a.apps.googleusercontent.com',

  // New Web Application OAuth client
  '259897327569-i00av7kg2a4ll757jdn8p7gem4go5nr5.apps.googleusercontent.com'
]);

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_PHRASES = 5000;

// Create the wordbank tables if they do not already exist.
db.exec(`
  CREATE TABLE IF NOT EXISTS wordbank_users (
    google_sub TEXT PRIMARY KEY,
    email TEXT,
    display_name TEXT,
    last_saved_at TEXT
  );

  CREATE TABLE IF NOT EXISTS wordbank_phrases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    google_sub TEXT NOT NULL,
    text TEXT NOT NULL,
    url TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    FOREIGN KEY (google_sub)
      REFERENCES wordbank_users(google_sub)
      ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_wordbank_phrases_user
    ON wordbank_phrases(google_sub);
`);

// Existing databases may have been created before the extension supported
// translated words and definitions. Add these columns without deleting data.
const phraseColumns = new Set(
  db.prepare('PRAGMA table_info(wordbank_phrases)')
    .all()
    .map(column => column.name)
);

if (!phraseColumns.has('translated_word')) {
  db.exec("ALTER TABLE wordbank_phrases ADD COLUMN translated_word TEXT NOT NULL DEFAULT ''");
}

if (!phraseColumns.has('definition')) {
  db.exec("ALTER TABLE wordbank_phrases ADD COLUMN definition TEXT NOT NULL DEFAULT ''");
}


function reply(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8'
  });
  res.end(JSON.stringify(data));
}

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

// Authenticate the Google account making the request.
async function googleUserFromRequest(req) {
  const match = /^Bearer\s+(\S+)$/i.exec(
    req.headers.authorization ?? ''
  );

  if (!match) {
    throw httpError(401, 'Missing Google access token');
  }

  let response;

  try {
    response = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${match[1]}`
        },
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    throw httpError(
      503,
      'Google authentication is temporarily unavailable'
    );
  }

  if (!response.ok) {
    throw httpError(
      401,
      'Invalid or expired Google access token'
    );
  }

  const profile = await response.json();

  // Validate the token with Google.
  let tokenInfoResponse;

  try {
    tokenInfoResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${
        encodeURIComponent(match[1])
      }`,
      {
        signal: AbortSignal.timeout(10000)
      }
    );
  } catch {
    throw httpError(
      503,
      'Google token validation is temporarily unavailable'
    );
  }

  if (!tokenInfoResponse.ok) {
    throw httpError(
      401,
      'Google token validation failed'
    );
  }

  const tokenInfo = await tokenInfoResponse.json();

  const authorizedClient =
    tokenInfo.azp ??
    tokenInfo.issued_to ??
    tokenInfo.aud ??
    tokenInfo.audience;

  // UPDATED:
  // Accept either our Chrome Extension client
  // or our Web Application client.
  // Reject tokens belonging to other applications.
  if (!ALLOWED_GOOGLE_CLIENT_IDS.has(authorizedClient)) {
    throw httpError(
      401,
      'Token was issued to a different application'
    );
  }

  // Ensure the token and profile identify the same user.
  if (tokenInfo.sub && tokenInfo.sub !== profile.sub) {
    throw httpError(401, 'Google account mismatch');
  }

  if (
    typeof profile.sub !== 'string' ||
    !profile.sub
  ) {
    throw httpError(
      401,
      'Google did not provide an account ID'
    );
  }

  return {
    id: profile.sub,
    email:
      typeof profile.email === 'string'
        ? profile.email
        : null,
    name:
      typeof profile.name === 'string'
        ? profile.name
        : null
  };
}

// Read and parse incoming JSON.
async function readJson(req) {
  const chunks = [];
  let size = 0;

  for await (const chunk of req) {
    size += chunk.length;

    if (size > MAX_BODY_BYTES) {
      throw httpError(
        413,
        'Wordbank file is too large'
      );
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(
      Buffer.concat(chunks).toString('utf8')
    );
  } catch {
    throw httpError(
      400,
      'Request must contain valid JSON'
    );
  }
}

// Accept both the extension's originalText format and the older text format.
// Normalize before writing, so existing clients and JSON imports both work.
function validatePhrases(body) {
  if (!Array.isArray(body?.phrases)) {
    throw httpError(400, 'Expected an object with a phrases array');
  }

  if (body.phrases.length > MAX_PHRASES) {
    throw httpError(413, 'Too many phrases in one wordbank');
  }

  return body.phrases.map((phrase, index) => {
    const text = phrase?.originalText ?? phrase?.text;
    const translatedWord = phrase?.translatedWord ?? '';
    const definition = phrase?.definition ?? '';

    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > 2000 ||
      typeof translatedWord !== 'string' ||
      translatedWord.length > 2000 ||
      typeof definition !== 'string' ||
      definition.length > 10000 ||
      typeof phrase.url !== 'string' ||
      phrase.url.length > 4000 ||
      typeof phrase.savedAt !== 'string' ||
      !Number.isFinite(Date.parse(phrase.savedAt))
    ) {
      throw httpError(400, `Invalid phrase at position ${index + 1}`);
    }

    return {
      text,
      translatedWord,
      definition,
      url: phrase.url,
      savedAt: phrase.savedAt
    };
  });
}

// Prepared database statements.
const upsertUser = db.prepare(`
  INSERT INTO wordbank_users
    (google_sub, email, display_name)
  VALUES (?, ?, ?)
  ON CONFLICT(google_sub) DO UPDATE SET
    email = excluded.email,
    display_name = excluded.display_name
`);

const getUser = db.prepare(`
  SELECT last_saved_at
  FROM wordbank_users
  WHERE google_sub = ?
`);

const getPhrases = db.prepare(`
  SELECT text, translated_word AS translatedWord, definition,
         url, saved_at AS savedAt
  FROM wordbank_phrases
  WHERE google_sub = ?
  ORDER BY id
`);

const deletePhrases = db.prepare(`
  DELETE FROM wordbank_phrases
  WHERE google_sub = ?
`);

const insertPhrase = db.prepare(`
  INSERT INTO wordbank_phrases
    (google_sub, text, translated_word, definition, url, saved_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

const markSaved = db.prepare(`
  UPDATE wordbank_users
  SET last_saved_at = ?
  WHERE google_sub = ?
`);

// Handle requests to /wordbank.
async function handleWordbankSync(req, res) {
  try {
    const user = await googleUserFromRequest(req);

    // Download the user's saved wordbank.
    if (req.method === 'GET') {
      upsertUser.run(
        user.id,
        user.email,
        user.name
      );

      const record = getUser.get(user.id);
      const phrases = getPhrases.all(user.id).map(phrase => ({
        // Both names are returned for compatibility with existing clients.
        text: phrase.text,
        originalText: phrase.text,
        translatedWord: phrase.translatedWord,
        definition: phrase.definition,
        url: phrase.url,
        savedAt: phrase.savedAt
      }));

      reply(res, 200, {
        user,
        hasSavedWordbank:
          record.last_saved_at !== null,
        phrases
      });

      return;
    }

    // Upload the user's current wordbank.
    if (req.method === 'PUT') {
      const phrases = validatePhrases(
        await readJson(req)
      );

      // Atomically replace the user's saved wordbank.
      db.exec('BEGIN IMMEDIATE');

      try {
        upsertUser.run(
          user.id,
          user.email,
          user.name
        );

        deletePhrases.run(user.id);

        for (const phrase of phrases) {
          insertPhrase.run(
            user.id,
            phrase.text,
            phrase.translatedWord,
            phrase.definition,
            phrase.url,
            phrase.savedAt
          );
        }

        markSaved.run(
          new Date().toISOString(),
          user.id
        );

        db.exec('COMMIT');

      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }

      reply(res, 200, {
        success: true,
        saved: phrases.length
      });

      return;
    }

    reply(res, 405, {
      error: 'Method not allowed'
    });

  } catch (error) {
    console.error(
      'Wordbank sync:',
      error.message
    );

    if (!res.headersSent) {
      reply(
        res,
        error.status ?? 500,
        {
          error: error.status
            ? error.message
            : 'Internal server error'
        }
      );
    }
  }
}

module.exports = {
  handleWordbankSync
};
