const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GoogleCalendarClient,
  buildAuthorizationUrl,
  parseDesktopClientCredentials,
  validateOAuthCallback,
} = require("../src/google-calendar");

test("desktop client credentials are read from Google's downloaded JSON shape", () => {
  assert.deepEqual(parseDesktopClientCredentials(JSON.stringify({
    installed: {
      client_id: "client-id.apps.googleusercontent.com",
      client_secret: "client-secret",
    },
  })), {
    clientId: "client-id.apps.googleusercontent.com",
    clientSecret: "client-secret",
  });

  assert.throws(
    () => parseDesktopClientCredentials("{}"),
    /Desktop app OAuth client JSON/,
  );
});

test("authorization URL uses PKCE, loopback callback, and the narrow event scope", () => {
  const url = new URL(buildAuthorizationUrl({
    clientId: "client-id.apps.googleusercontent.com",
    redirectUri: "http://127.0.0.1:43210/oauth2/callback",
    state: "state-value",
    codeChallenge: "challenge-value",
  }));

  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "https://www.googleapis.com/auth/calendar.events.readonly");
});

test("OAuth callback accepts only a matching state and authorization code", () => {
  const accepted = new URL("http://127.0.0.1/oauth2/callback?code=authorization-code&state=expected-state");
  assert.equal(validateOAuthCallback(accepted, "expected-state"), "authorization-code");

  const wrongState = new URL("http://127.0.0.1/oauth2/callback?code=authorization-code&state=wrong-state");
  assert.throws(() => validateOAuthCallback(wrongState, "expected-state"), /invalid state/);

  const denied = new URL("http://127.0.0.1/oauth2/callback?error=access_denied&state=expected-state");
  assert.throws(() => validateOAuthCallback(denied, "expected-state"), /access_denied/);
});

test("calendar client refreshes an expired access token and lists expanded primary events", async () => {
  const requests = [];
  const credentialStore = {
    value: {
      credentials: { clientId: "client-id", clientSecret: "client-secret" },
      tokens: { accessToken: "old", refreshToken: "refresh", expiresAt: 0 },
    },
    load() { return this.value; },
    save(value) { this.value = value; },
  };
  const fetch = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).includes("oauth2.googleapis.com/token")) {
      return new Response(JSON.stringify({ access_token: "new", expires_in: 3600 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ items: [{ id: "event-1" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const client = new GoogleCalendarClient({ credentialStore, fetch, now: () => 1000 });

  const events = await client.listUpcomingEvents(new Date("2026-08-19T10:00:00.000Z"));

  assert.deepEqual(events, [{ id: "event-1" }]);
  assert.equal(requests.length, 2);
  assert.match(requests[1].url, /calendars\/primary\/events/);
  const eventsUrl = new URL(requests[1].url);
  assert.equal(eventsUrl.searchParams.get("singleEvents"), "true");
  assert.equal(eventsUrl.searchParams.get("orderBy"), "startTime");
  assert.equal(requests[1].options.headers.Authorization, "Bearer new");
  assert.equal(credentialStore.value.tokens.refreshToken, "refresh");
});

test("calendar client reports disconnected when encrypted credentials cannot be read", () => {
  const client = new GoogleCalendarClient({
    credentialStore: { load() { throw new Error("keychain unavailable"); } },
  });

  assert.equal(client.isConnected(), false);
});
