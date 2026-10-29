
 // Wordbank login: choose a Google account on every explicit sign-in.
 // Keep local edits live; sync with SQLite only on Save & Log Out.
 const WORDBANK_API = 'http://100.87.150.51:3000';
 const ACTIVE_USER_KEY = 'wordbankActiveUser';
 const AUTH_SESSION_KEY = 'wordbankOAuthSession';

 // Use a Google Cloud OAuth "Web application" client.
 // Its authorized redirect URI must match
 // chrome.identity.getRedirectURL().
 const GOOGLE_WEB_CLIENT_ID = '259897327569-i00av7kg2a4ll757jdn8p7gem4go5nr5.apps.googleusercontent.com';

 const GOOGLE_SCOPES = [
   'https://www.googleapis.com/auth/userinfo.email',
   'https://www.googleapis.com/auth/userinfo.profile'
 ];

 const loginButton = document.getElementById('google-login');
 const loginStatus = document.getElementById('google-login-status');
 const logoutButton = document.getElementById('save-logout');

 // Tokens are held in memory and session storage.
 let currentToken = null;
 let currentUserId = null;
 let currentTokenExpiresAt = 0;

 function localPhrasesFrom(storage) {
   return Object.entries(storage).filter(
     ([key]) => key.startsWith('phrase:')
   );
 }

 async function wordbankRequest(method, token, phrases) {
   const response = await fetch(`${WORDBANK_API}/wordbank`, {
     method,
     headers: {
       Authorization: `Bearer ${token}`,
       ...(method === 'PUT'
         ? { 'Content-Type': 'application/json' }
         : {})
     },
     ...(method === 'PUT'
       ? { body: JSON.stringify({ phrases }) }
       : {})
   });

   const result = await response.json().catch(() => ({}));

   if (!response.ok) {
     const error = new Error(
       result.error || `Server error ${response.status}`
     );
     error.status = response.status;
     throw error;
   }

   return result;
 }

 // Request Google's account chooser on every explicit login.
 async function chooseGoogleAccount() {
   if (!/^\d+-[a-z0-9-]+\.apps\.googleusercontent\.com$/.test(
     GOOGLE_WEB_CLIENT_ID
   )) {
     throw new Error(
       'Set GOOGLE_WEB_CLIENT_ID to your Web application OAuth client ID first.'
     );
   }

   const redirectUri = chrome.identity.getRedirectURL();
   const state = crypto.randomUUID();

   const authUrl = new URL(
     'https://accounts.google.com/o/oauth2/v2/auth'
   );

   authUrl.search = new URLSearchParams({
     client_id: GOOGLE_WEB_CLIENT_ID,
     redirect_uri: redirectUri,
     response_type: 'token',
     scope: GOOGLE_SCOPES.join(' '),
     prompt: 'select_account',
     state
   }).toString();

   const responseUrl = await chrome.identity.launchWebAuthFlow({
     url: authUrl.toString(),
     interactive: true
   });

   if (!responseUrl) {
     throw new Error('Google sign-in was cancelled.');
   }

   const callbackUrl = new URL(responseUrl);
   const expectedUrl = new URL(redirectUri);

   if (
     callbackUrl.origin !== expectedUrl.origin ||
     callbackUrl.pathname !== expectedUrl.pathname
   ) {
     throw new Error('Unexpected Google OAuth redirect URL.');
   }

   const params = new URLSearchParams(
     callbackUrl.hash.slice(1)
   );

   if (params.get('state') !== state) {
     throw new Error(
       'Google sign-in state did not match. Please retry.'
     );
   }

   if (params.has('error')) {
     throw new Error(
       params.get('error_description') ||
       params.get('error')
     );
   }

   const token = params.get('access_token');

   if (!token) {
     throw new Error('No Google access token received.');
   }

   const seconds = Number(params.get('expires_in'));
   const validSeconds =
     Number.isFinite(seconds) && seconds > 60
       ? seconds - 60
       : 300;

   return {
     token,
     expiresAt: Date.now() + validSeconds * 1000
   };
 }

 async function saveSession() {
   await chrome.storage.session.set({
     [AUTH_SESSION_KEY]: {
       userId: currentUserId,
       token: currentToken,
       expiresAt: currentTokenExpiresAt
     }
   });
 }

 function showSignedIn(user, message) {
   loginButton.hidden = true;
   logoutButton.hidden = false;

   loginStatus.textContent =
     `Welcome, ${user.name || user.email || 'Google user'}! ${message}`;
 }

 // Add missing server phrases without deleting local edits.
 async function mergeServerPhrases(serverPhrases) {
   const local = await chrome.storage.local.get(null);

   const existing = new Set(
     localPhrasesFrom(local)
       .map(([, phrase]) =>
         phrase?.text?.trim()?.toLowerCase()
       )
       .filter(Boolean)
   );

   const additions = {};

   for (const phrase of serverPhrases) {
     const normalized =
       phrase?.text?.trim()?.toLowerCase();

     if (!normalized || existing.has(normalized)) {
       continue;
     }

     additions[
       `phrase:${Date.now()}:${crypto.randomUUID()}`
     ] = phrase;

     existing.add(normalized);
   }

   if (Object.keys(additions).length > 0) {
     await chrome.storage.local.set(additions);
   }
 }

 // Google login button.
 loginButton.addEventListener('click', async () => {
   loginButton.disabled = true;

   loginStatus.textContent =
     'Choose a Google account to load your wordbank...';

   try {
     const auth = await chooseGoogleAccount();

     const remote = await wordbankRequest(
       'GET',
       auth.token
     );

     if (
       !remote.user?.id ||
       !Array.isArray(remote.phrases)
     ) {
       throw new Error(
         'Unexpected response from the Wordbank server'
       );
     }

     const { [ACTIVE_USER_KEY]: previousUser } =
       await chrome.storage.local.get(ACTIVE_USER_KEY);

     const local = await chrome.storage.local.get(null);

     if (
       previousUser &&
       previousUser !== remote.user.id &&
       localPhrasesFrom(local).length > 0
     ) {
       throw new Error(
         'A different Google account was using these local words. ' +
         'Sign in with the original account to save them first.'
       );
     }

     // Merge server phrases into local storage.
     await mergeServerPhrases(remote.phrases);

     // Remember the account without persisting its token.
     await chrome.storage.local.set({
       [ACTIVE_USER_KEY]: remote.user.id
     });

     currentToken = auth.token;
     currentTokenExpiresAt = auth.expiresAt;
     currentUserId = remote.user.id;

     await saveSession();

     showSignedIn(
       remote.user,
       'Your local words are ready.'
     );

     await displayPhrases();

   } catch (error) {
     loginStatus.textContent =
       `Login failed: ${error.message}`;
   } finally {
     loginButton.disabled = false;
   }
 });

 // Restore an existing session after refreshing the page.
 async function resumeLoginAfterRefresh() {
   const { [ACTIVE_USER_KEY]: savedUserId } =
     await chrome.storage.local.get(ACTIVE_USER_KEY);

   if (!savedUserId) return;

   loginButton.disabled = true;
   loginStatus.textContent = 'Restoring your login...';

   try {
     const { [AUTH_SESSION_KEY]: auth } =
       await chrome.storage.session.get(AUTH_SESSION_KEY);

     if (
       !auth?.token ||
       auth.userId !== savedUserId ||
       !Number.isFinite(auth.expiresAt) ||
       Date.now() >= auth.expiresAt
     ) {
       throw new Error('Google sign-in required');
     }

     // Verify the account without merging local words.
     const remote = await wordbankRequest(
       'GET',
       auth.token
     );

     if (remote.user?.id !== savedUserId) {
       throw new Error('Google account changed');
     }

     currentToken = auth.token;
     currentTokenExpiresAt = auth.expiresAt;
     currentUserId = savedUserId;

     showSignedIn(
       remote.user,
       'Your local edits are preserved.'
     );

   } catch (error) {
     await chrome.storage.session.remove(
       AUTH_SESSION_KEY
     );

     loginStatus.textContent =
       `Please sign in again (${error.message}). ` +
       'Your local words are safe.';

   } finally {
     loginButton.disabled = false;
   }
 }

 // Reauthenticate before saving if necessary.
 async function reauthenticateCurrentUser() {
   const auth = await chooseGoogleAccount();

   const remote = await wordbankRequest(
     'GET',
     auth.token
   );

   if (remote.user?.id !== currentUserId) {
     throw new Error(
       'Google account changed; wordbank was not uploaded'
     );
   }

   currentToken = auth.token;
   currentTokenExpiresAt = auth.expiresAt;

   await saveSession();
 }

 // Save & Log Out button.
 logoutButton.addEventListener('click', async () => {
   if (!currentToken) return;

   logoutButton.disabled = true;
   loginStatus.textContent =
     'Saving your wordbank to SQLite...';

   try {
     const local = await chrome.storage.local.get(null);
     const entries = localPhrasesFrom(local);
     const phrases = entries.map(([, phrase]) => phrase);

     // Refresh expired authentication.
     if (Date.now() >= currentTokenExpiresAt) {
       await reauthenticateCurrentUser();
     }

     try {
       await wordbankRequest(
         'PUT',
         currentToken,
         phrases
       );

     } catch (error) {
       if (error.status !== 401) {
         throw error;
       }

       // Refresh a revoked token.
       await reauthenticateCurrentUser();

       await wordbankRequest(
         'PUT',
         currentToken,
         phrases
       );
     }

     // Only clear local words after a successful upload.
     await chrome.storage.session.remove(
       AUTH_SESSION_KEY
     );

     await chrome.storage.local.remove([
       ...entries.map(([key]) => key),
       ACTIVE_USER_KEY
     ]);

     currentToken = null;
     currentUserId = null;
     currentTokenExpiresAt = 0;

     logoutButton.hidden = true;
     loginButton.hidden = false;

     loginStatus.textContent =
       `Saved ${phrases.length} phrases. Logged out!`;

     await displayPhrases();

   } catch (error) {
     loginStatus.textContent =
       `Save/Logout failed: ${error.message}. ` +
       'Local words were not intentionally cleared.';

   } finally {
     logoutButton.disabled = false;
   }
 });

 // Resume a saved session when the page opens.
 void resumeLoginAfterRefresh();
