const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ControlIdIncrementalSync,
} = require("../../../src/integrations/control-id");

function makeServiceFromPages(pages) {
  return {
    async getAccessRecords({ offset = 0, limit = 50 } = {}) {
      const page = pages[offset / limit] ?? [];
      if (!Array.isArray(page)) {
        return { ok: true, items: [] };
      }

      return {
        ok: true,
        count: page.length,
        items: page,
      };
    },
  };
}

function makeServiceFromSequence(sequence) {
  let index = 0;
  return {
    async getAccessRecords({ offset = 0, limit = 50 } = {}) {
      if (index >= sequence.length) {
        return { ok: true, items: [] };
      }

      const current = sequence[index];
      index += 1;

      if (typeof current === "function") {
        return current({ offset, limit });
      }

      return current;
    },
  };
}

test("sincronizacao consulta registros em varios lotes e avanca o checkpoint", async () => {
  const pages = [
    [
      { id: 1, event: 7, portal_id: 1 },
      { id: 2, event: 7, portal_id: 1 },
    ],
    [
      { id: 3, event: 8, portal_id: 2 },
      { id: 4, event: 9, portal_id: 2 },
    ],
  ];
  const service = makeServiceFromPages(pages);
  const sync = new ControlIdIncrementalSync({ service, pageSize: 2 });

  const result = await sync.run();

  assert.equal(result.ok, true);
  assert.equal(result.count, 4);
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    [1, 2, 3, 4],
  );
  assert.equal(sync.getCheckpoint().offset, 4);
  assert.equal(sync.getCheckpoint().lastId, 4);
});

test("sincronizacao trata lista vazia sem avançar checkpoint", async () => {
  const service = makeServiceFromPages([]);
  const sync = new ControlIdIncrementalSync({ service, pageSize: 5 });

  const result = await sync.run();

  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.deepEqual(result.items, []);
  assert.deepEqual(sync.getCheckpoint(), { offset: 0, lastId: null });
});

test("sincronizacao ignora registros repetidos dentro da mesma execucao e em execucoes seguintes", async () => {
  const pages = [
    [
      { id: 1, event: 7, portal_id: 1 },
      { id: 2, event: 7, portal_id: 1 },
    ],
    [
      { id: 2, event: 7, portal_id: 1 },
      { id: 3, event: 9, portal_id: 2 },
    ],
  ];

  const service = makeServiceFromPages(pages);
  const sync = new ControlIdIncrementalSync({ service, pageSize: 2 });

  const firstRun = await sync.run();
  const secondRun = await sync.run();

  assert.equal(firstRun.count, 3);
  assert.equal(secondRun.count, 0);
  assert.deepEqual(
    firstRun.items.map((entry) => entry.id),
    [1, 2, 3],
  );
});

test("sincronizacao nao avanca o checkpoint quando uma pagina intermediaria falha", async () => {
  const service = makeServiceFromSequence([
    () => ({
      ok: true,
      items: [
        { id: 1, event: 7, portal_id: 1 },
        { id: 2, event: 7, portal_id: 1 },
      ],
    }),
    () => {
      throw new Error("falha intermediaria");
    },
  ]);

  const sync = new ControlIdIncrementalSync({ service, pageSize: 2 });
  const result = await sync.run();

  assert.equal(result.ok, false);
  assert.deepEqual(sync.getCheckpoint(), { offset: 0, lastId: null });
  assert.equal(result.error.message, "falha intermediaria");
});

test("sincronizacao retoma depois de falha sem descartar checkpoint valido anterior", async () => {
  const service = makeServiceFromSequence([
    () => ({
      ok: true,
      items: [
        { id: 1, event: 7, portal_id: 1 },
        { id: 2, event: 7, portal_id: 1 },
      ],
    }),
    () => ({ ok: true, items: [{ id: 3, event: 7, portal_id: 1 }] }),
    () => {
      throw new Error("falha final");
    },
  ]);

  const sync = new ControlIdIncrementalSync({ service, pageSize: 2 });
  await sync.run();
  sync.getCheckpoint();

  const secondService = makeServiceFromSequence([
    () => ({
      ok: true,
      items: [
        { id: 4, event: 7, portal_id: 1 },
        { id: 5, event: 7, portal_id: 1 },
      ],
    }),
    () => {
      throw new Error("falha na retomada");
    },
  ]);

  const resumed = new ControlIdIncrementalSync({
    service: secondService,
    pageSize: 2,
    checkpoint: { offset: 2, lastId: 2 },
  });

  const result = await resumed.run();

  assert.equal(result.ok, false);
  assert.deepEqual(resumed.getCheckpoint(), { offset: 2, lastId: 2 });
});

test("sincronizacao descarta registros sem identificador confiavel", async () => {
  const service = makeServiceFromPages([
    [
      { event: 7, portal_id: 1 },
      { id: 2, event: 8, portal_id: 2 },
    ],
  ]);

  const sync = new ControlIdIncrementalSync({ service, pageSize: 2 });
  const result = await sync.run();

  assert.equal(result.count, 1);
  assert.equal(result.items[0].id, 2);
  assert.equal(result.skipped, 1);
});
