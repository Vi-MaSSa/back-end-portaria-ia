const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ControlIdClient,
  ControlIdAdapter,
} = require("../../../src/integrations/control-id");

test("adaptador consulta registros de acesso", async () => {
  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async (url, options) => {
      if (String(url).includes("/login.fcgi")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ session: "session-test" }),
        };
      }

      assert.ok(String(url).includes("/load_objects.fcgi"));
      assert.deepEqual(JSON.parse(options.body), {
        object: "access_logs",
        limit: 5,
      });

      return {
        ok: true,
        status: 200,
        json: async () => ({
          access_logs: [{ id: 1, event: 7, portal_id: 1 }],
        }),
      };
    },
  });

  const adapter = new ControlIdAdapter({ client });
  const result = await adapter.getAccessLogs({ limit: 5 });

  assert.equal(result.access_logs.length, 1);
  assert.equal(result.access_logs[0].id, 1);
});

test("adaptador consulta usuários sem presumir que existam", async () => {
  const client = new ControlIdClient({
    baseURL: "http://192.168.0.129",
    username: "test-user",
    password: "test-password",
    fetchImpl: async (url) => ({
      ok: true,
      status: 200,
      json: async () =>
        String(url).includes("/login.fcgi")
          ? { session: "session-test" }
          : { users: [] },
    }),
  });

  const adapter = new ControlIdAdapter({ client });
  const result = await adapter.getUsers({ limit: 5 });

  assert.deepEqual(result.users, []);
});
