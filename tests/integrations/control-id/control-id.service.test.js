const test = require("node:test");
const assert = require("node:assert/strict");
const { ControlIdService } = require("../../../src/integrations/control-id");
const {
  ControlIdAuthenticationError,
  ControlIdHttpError,
  ControlIdConnectionError,
  ControlIdResponseError,
} = require("../../../src/integrations/control-id/control-id.errors");

function makeClient(overrides = {}) {
  return {
    getSystemInformation: async () => ({ version: "8.2.7" }),
    getAccessLogs: async () => ({
      access_logs: [{ id: 1, event: 7, portal_id: 1 }],
    }),
    getUsers: async () => ({ users: [{ id: 1, name: "user-1" }] }),
    checkSessionValidity: async () => ({ session_is_valid: true }),
    validateSession: async () => ({ valid: true, source: "local" }),
    ...overrides,
  };
}

test("servico retorna informacoes do equipamento em formato consistente", async () => {
  const service = new ControlIdService({
    client: makeClient(),
  });

  const result = await service.getEquipmentInfo();

  assert.deepEqual(result, {
    ok: true,
    source: "control_id",
    data: { version: "8.2.7" },
  });
});

test("servico consulta registros de acesso com paginacao e metadata", async () => {
  const client = makeClient({
    getAccessLogs: async ({ limit, offset }) => ({
      access_logs: [{ id: 10, event: 7, portal_id: 3 }],
      limit,
      offset,
    }),
  });

  const service = new ControlIdService({ client });
  const result = await service.getAccessRecords({ limit: 25, offset: 50 });

  assert.equal(result.ok, true);
  assert.equal(result.count, 1);
  assert.equal(result.limit, 25);
  assert.equal(result.offset, 50);
  assert.equal(result.items[0].id, 10);
  assert.equal(result.items[0].portal_id, 3);
});

test("servico consulta usuarios com campos explicitamente solicitados", async () => {
  const client = makeClient({
    getUsers: async ({ fields, limit, offset }) => ({
      users: [{ id: 2, name: "reported-user" }],
      fields,
      limit,
      offset,
    }),
  });

  const service = new ControlIdService({ client });
  const result = await service.getUsers({
    limit: 10,
    offset: 3,
    fields: ["id", "name"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.limit, 10);
  assert.equal(result.offset, 3);
  assert.equal(result.items[0].id, 2);
  assert.equal(result.items[0].name, "reported-user");
});

test("servico propaga erro de autenticacao sem expor credenciais ou sessao", async () => {
  const client = makeClient({
    getSystemInformation: async () => {
      throw new ControlIdAuthenticationError("invalid session", {
        session: "SECRET_SESSION",
        username: "admin",
      });
    },
  });

  const service = new ControlIdService({ client });

  await assert.rejects(
    service.getEquipmentInfo(),
    (error) =>
      error.code === "AUTHENTICATION_ERROR" &&
      !String(error.message).includes("admin") &&
      !String(error.message).includes("SECRET_SESSION") &&
      !String(JSON.stringify(error.details)).includes("admin") &&
      !String(JSON.stringify(error.details)).includes("SECRET_SESSION"),
  );
});

test("servico propaga erro HTTP e erro de conexao", async () => {
  const httpClient = makeClient({
    getSystemInformation: async () => {
      throw new ControlIdHttpError(500, {
        endpoint: "system_information.fcgi",
      });
    },
  });

  const connClient = makeClient({
    getSystemInformation: async () => {
      throw new ControlIdConnectionError("Could not connect to Control iD", {
        cause: "ECONNREFUSED",
      });
    },
  });

  const httpService = new ControlIdService({ client: httpClient });
  const connService = new ControlIdService({ client: connClient });

  await assert.rejects(
    httpService.getEquipmentInfo(),
    (error) => error.code === "HTTP_ERROR",
  );
  await assert.rejects(
    connService.getEquipmentInfo(),
    (error) => error.code === "CONNECTION_ERROR",
  );
});

test("servico trata respostas invalidas e listas vazias sem vazar dados", async () => {
  const invalidClient = makeClient({
    getAccessLogs: async () => {
      throw new ControlIdResponseError(
        "Control iD returned a non-JSON response",
        {
          endpoint: "load_objects.fcgi",
        },
      );
    },
  });

  const emptyClient = makeClient({
    getAccessLogs: async () => ({ access_logs: [] }),
  });

  const invalidService = new ControlIdService({ client: invalidClient });
  const emptyService = new ControlIdService({ client: emptyClient });

  await assert.rejects(
    invalidService.getAccessRecords(),
    (error) => error.code === "INVALID_RESPONSE",
  );

  const emptyResult = await emptyService.getAccessRecords();
  assert.equal(emptyResult.count, 0);
  assert.deepEqual(emptyResult.items, []);
});
