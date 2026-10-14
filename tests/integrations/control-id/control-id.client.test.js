const test = require("node:test");
const assert = require("node:assert/strict");
const { ControlIdClient } = require("../../../src/integrations/control-id");

function mockResponse(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test("login armazena a sessão recebida", async () => {
  const calls = [];
  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return mockResponse({ session: "test-session" });
    },
  });

  const session = await client.login();

  assert.equal(session, "test-session");
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith("/login.fcgi"));

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.login, "test-user");
  assert.equal(body.password, "test-password");
});

test("consulta informações do sistema usando a sessão", async () => {
  const calls = [];

  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async (url) => {
      calls.push(String(url));

      if (String(url).includes("/login.fcgi")) {
        return mockResponse({ session: "session-123" });
      }

      return mockResponse({ product: "iDFace Pro" });
    },
  });

  const result = await client.getSystemInformation();

  assert.deepEqual(result, { product: "iDFace Pro" });
  assert.equal(calls.length, 2);
  assert.ok(calls[1].includes("/system_information.fcgi"));
  assert.ok(calls[1].includes("session=session-123"));
});

test("rejeita login sem sessão", async () => {
  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => mockResponse({}),
  });

  await assert.rejects(
    client.login(),
    (error) => error.code === "AUTHENTICATION_ERROR",
  );
});

test("converte falhas HTTP em erro padronizado", async () => {
  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => mockResponse({ message: "Forbidden" }, 403),
  });

  await assert.rejects(
    client.login(),
    (error) => error.code === "HTTP_ERROR" && error.status === 403,
  );
});

test("converte falha de conexão em erro padronizado", async () => {
  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => {
      throw new TypeError("network failure");
    },
  });

  await assert.rejects(
    client.login(),
    (error) => error.code === "CONNECTION_ERROR",
  );
});

test("converte timeout em erro padronizado", async () => {
  const client = new ControlIdClient({
    baseURL: "http://127.0.0.1",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => {
      const error = new Error("timeout");
      error.name = "TimeoutError";
      throw error;
    },
  });

  await assert.rejects(
    client.login(),
    (error) =>
      error.code === "CONNECTION_ERROR" &&
      error.message === "Control iD request timed out",
  );
});

test("rejeita resposta que nao contem JSON valido", async () => {
  const client = new ControlIdClient({
    baseURL: "http://127.0.0.1",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("invalid JSON");
      },
    }),
  });

  await assert.rejects(
    client.login(),
    (error) => error.code === "INVALID_RESPONSE",
  );
});

test("identifica erro de API quando a sessao e rejeitada", async () => {
  const client = new ControlIdClient({
    baseURL: "http://127.0.0.1",
    username: "test-user",
    password: "test-password",
    fetchImpl: async (url) => {
      if (String(url).includes("/login.fcgi")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ session: "expired-session" }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({ error: "Invalid session" }),
      };
    },
  });

  await assert.rejects(
    client.getSystemInformation(),
    (error) => error.code === "INVALID_RESPONSE",
  );
});

test("prioriza erro HTTP mesmo quando a resposta nao e JSON", async () => {
  const client = new ControlIdClient({
    baseURL: "http://127.0.0.1",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      json: async () => {
        throw new SyntaxError("invalid JSON");
      },
    }),
  });

  await assert.rejects(
    client.login(),
    (error) => error.code === "HTTP_ERROR" && error.status === 500,
  );
});

test("valida e limpa sessão local sem afirmar logout remoto", async () => {
  const client = new ControlIdClient({
    baseURL: "http://127.0.0.1",
    username: "test-user",
    password: "test-password",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ session: "local-session" }),
    }),
  });

  await client.login();
  assert.equal((await client.validateSession()).valid, true);

  const logoutResult = await client.logout();
  assert.equal(logoutResult.localCleared, true);
  assert.equal(logoutResult.remoteConfirmed, false);
  assert.equal((await client.validateSession()).valid, false);
});

test("verifica validade da sessão usando o endpoint documentado", async () => {
  const client = new ControlIdClient({
    baseURL: "http://127.0.0.1",
    username: "test-user",
    password: "test-password",
    fetchImpl: async (url) => {
      if (String(url).includes("/login.fcgi")) {
        return mockResponse({ session: "session-abc" });
      }

      if (String(url).includes("/session_is_valid.fcgi")) {
        return mockResponse({ session_is_valid: true });
      }

      throw new Error("unexpected endpoint");
    },
  });

  await client.login();
  const result = await client.checkSessionValidity();

  assert.deepEqual(result, { session_is_valid: true });
  assert.equal(client.session, "session-abc");
});
