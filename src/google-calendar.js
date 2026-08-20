const crypto = require("node:crypto");
const http = require("node:http");

const AUTHORIZATION_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const EVENTS_ENDPOINT = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const CALENDAR_EVENTS_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";
const CALLBACK_PATH = "/oauth2/callback";

function parseDesktopClientCredentials(contents) {
  let parsed;
  try {
    parsed = JSON.parse(contents);
  } catch {
    throw new Error("Choose a valid Google Desktop app OAuth client JSON file.");
  }

  const installed = parsed?.installed;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error("Choose a Google Desktop app OAuth client JSON file.");
  }

  return { clientId: installed.client_id, clientSecret: installed.client_secret };
}

function buildAuthorizationUrl({ clientId, redirectUri, state, codeChallenge }) {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: CALENDAR_EVENTS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function base64Url(buffer) {
  return buffer.toString("base64url");
}

function sameState(received, expected) {
  if (typeof received !== "string") return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

function validateOAuthCallback(callback, expectedState) {
  if (!sameState(callback.searchParams.get("state"), expectedState)) {
    throw new Error("Google authorization returned an invalid state value.");
  }
  const providerError = callback.searchParams.get("error");
  if (providerError) throw new Error(`Google authorization was not completed: ${providerError}`);
  const code = callback.searchParams.get("code");
  if (!code) throw new Error("Google authorization did not return a code.");
  return code;
}

async function parseJsonResponse(response, context) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${context} returned an unreadable response.`);
  }
  if (!response.ok) {
    const detail = payload.error_description || payload.error?.message || payload.error || `HTTP ${response.status}`;
    throw new Error(`${context} failed: ${detail}`);
  }
  return payload;
}

async function requestTokens(parameters, fetchImplementation = globalThis.fetch) {
  const response = await fetchImplementation(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(parameters),
  });
  return parseJsonResponse(response, "Google authorization");
}

function tokensFromResponse(payload, existingRefreshToken, now = Date.now()) {
  if (!payload.access_token) throw new Error("Google authorization did not return an access token.");
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token || existingRefreshToken || null,
    expiresAt: now + (Number(payload.expires_in) || 3600) * 1000,
  };
}

async function connectWithDesktopOAuth({ credentials, openExternal, fetch: fetchImplementation = globalThis.fetch }) {
  const codeVerifier = base64Url(crypto.randomBytes(48));
  const codeChallenge = base64Url(crypto.createHash("sha256").update(codeVerifier).digest());
  const state = base64Url(crypto.randomBytes(32));

  return new Promise((resolve, reject) => {
    let settled = false;
    let handlingCallback = false;
    let timeout;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      server.close();
      if (error) reject(error); else resolve(value);
    };
    const respond = (response, status, heading, detail) => {
      response.writeHead(status, {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(`<!doctype html><meta charset="utf-8"><title>${heading}</title><style>body{font:16px system-ui;max-width:36rem;margin:12vh auto;padding:2rem;color:#20242d}h1{font-size:1.6rem}</style><h1>${heading}</h1><p>${detail}</p>`);
    };

    const server = http.createServer(async (request, response) => {
      try {
        const redirectUri = `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;
        const callback = new URL(request.url, redirectUri);
        if (callback.pathname !== CALLBACK_PATH) {
          response.writeHead(404).end();
          return;
        }
        if (request.method !== "GET") {
          response.writeHead(405, { Allow: "GET" }).end();
          return;
        }
        let code;
        try {
          code = validateOAuthCallback(callback, state);
        } catch (error) {
          respond(response, 400, "Connection rejected", "The authorization response could not be verified or was cancelled. Return to Remy and try again.");
          finish(error);
          return;
        }
        if (handlingCallback) {
          respond(response, 409, "Connection already finishing", "Return to Remy to see the connection status.");
          return;
        }
        handlingCallback = true;

        const tokenPayload = await requestTokens({
          client_id: credentials.clientId,
          client_secret: credentials.clientSecret,
          code,
          code_verifier: codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }, fetchImplementation);
        respond(response, 200, "Google Calendar connected", "Remy can now show local reminders for your upcoming events. You can close this tab.");
        finish(null, tokensFromResponse(tokenPayload));
      } catch (error) {
        respond(response, 500, "Connection failed", "Return to Remy for details and try again.");
        finish(error);
      }
    });

    server.on("error", (error) => finish(error));
    server.listen(0, "127.0.0.1", async () => {
      try {
        const redirectUri = `http://127.0.0.1:${server.address().port}${CALLBACK_PATH}`;
        await openExternal(buildAuthorizationUrl({
          clientId: credentials.clientId,
          redirectUri,
          state,
          codeChallenge,
        }));
      } catch (error) {
        finish(error);
      }
    });
    timeout = setTimeout(() => finish(new Error("Google authorization timed out. Please try again.")), 2 * 60_000);
  });
}

class GoogleCalendarClient {
  constructor({ credentialStore, fetch: fetchImplementation = globalThis.fetch, now = Date.now }) {
    this.credentialStore = credentialStore;
    this.fetch = fetchImplementation;
    this.now = now;
  }

  isConnected() {
    try {
      const record = this.credentialStore.load();
      return Boolean(record?.credentials?.clientId && record?.tokens?.refreshToken);
    } catch {
      return false;
    }
  }

  async accessToken(forceRefresh = false) {
    const record = this.credentialStore.load();
    if (!record?.credentials || !record?.tokens) throw new Error("Google Calendar is not connected.");
    if (!forceRefresh && record.tokens.accessToken && record.tokens.expiresAt > this.now() + 60_000) {
      return record.tokens.accessToken;
    }
    if (!record.tokens.refreshToken) throw new Error("Reconnect Google Calendar to refresh access.");

    const payload = await requestTokens({
      client_id: record.credentials.clientId,
      client_secret: record.credentials.clientSecret,
      refresh_token: record.tokens.refreshToken,
      grant_type: "refresh_token",
    }, this.fetch);
    const tokens = tokensFromResponse(payload, record.tokens.refreshToken, this.now());
    this.credentialStore.save({ ...record, tokens });
    return tokens.accessToken;
  }

  async listUpcomingEvents(now = new Date()) {
    const fetchEvents = async (accessToken) => {
      const url = new URL(EVENTS_ENDPOINT);
      url.search = new URLSearchParams({
        timeMin: now.toISOString(),
        timeMax: new Date(now.getTime() + 24 * 60 * 60_000).toISOString(),
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "100",
      }).toString();
      return this.fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    };

    let response = await fetchEvents(await this.accessToken());
    if (response.status === 401) response = await fetchEvents(await this.accessToken(true));
    const payload = await parseJsonResponse(response, "Google Calendar sync");
    return Array.isArray(payload.items) ? payload.items : [];
  }
}

module.exports = {
  GoogleCalendarClient,
  buildAuthorizationUrl,
  connectWithDesktopOAuth,
  parseDesktopClientCredentials,
  validateOAuthCallback,
};
