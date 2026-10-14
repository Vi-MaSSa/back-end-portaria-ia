require("dotenv").config();

const {
  ControlIdClient,
  ControlIdService,
  ControlIdIncrementalSync,
} = require("../src/integrations/control-id");

function getProjectEnv() {
  const baseURL = process.env.CONTROL_ID_BASE_URL;
  const username = process.env.CONTROL_ID_USERNAME;
  const password = process.env.CONTROL_ID_PASSWORD;
  const timeoutMs = Number(process.env.CONTROL_ID_TIMEOUT_MS || 5000);

  if (!baseURL || !username || !password) {
    throw new Error(
      "Configure CONTROL_ID_BASE_URL, CONTROL_ID_USERNAME e CONTROL_ID_PASSWORD no .env antes de executar o teste real.",
    );
  }

  return { baseURL, username, password, timeoutMs };
}

function summarizeFieldShape(records) {
  const sample = Array.isArray(records) ? records.slice(0, 5) : [];
  const fields = new Map();

  for (const record of sample) {
    if (!record || typeof record !== "object") {
      continue;
    }

    for (const key of Object.keys(record)) {
      const value = record[key];
      const type =
        value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
      const current = fields.get(key);
      if (!current || current !== type) {
        fields.set(key, type);
      }
    }
  }

  return Array.from(fields.entries()).map(([name, type]) => ({ name, type }));
}

function normalizeIdentity(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const asString = String(value).trim();
  return asString ? asString : null;
}

async function main() {
  const { baseURL, username, password, timeoutMs } = getProjectEnv();

  const client = new ControlIdClient({
    baseURL,
    username,
    password,
    timeoutMs,
  });

  const service = new ControlIdService({ client });
  const pageSize = 5;

  console.log("[1/6] Autenticando no equipamento...");
  await client.login();
  console.log("Autenticacao concluida. Sessao omitida por seguranca.");

  console.log("[2/6] Validacao local do estado da sessao...");
  const sessionStatus = await client.validateSession();
  console.log("status_sessao_local:", {
    valid: sessionStatus.valid,
    source: sessionStatus.source,
  });

  console.log(
    "[3/6] Consultando registros de acesso com leitura documentada...",
  );
  const pageOne = await service.getAccessRecords({
    limit: pageSize,
    offset: 0,
    fields: ["id", "event", "portal_id"],
    order: { id: "asc" },
  });

  console.log("dados_primeira_pagina:", {
    ok: pageOne.ok,
    count: pageOne.count,
    offset: pageOne.offset,
    limit: pageOne.limit,
    fieldShapes: summarizeFieldShape(pageOne.items),
  });

  console.log("[4/6] Executando sincronizacao inicial...");
  const syncOne = new ControlIdIncrementalSync({
    service,
    pageSize,
    order: { id: "asc" },
  });
  const firstRun = await syncOne.run();

  console.log("resultado_primeira_sincronizacao:", {
    ok: firstRun.ok,
    count: firstRun.count,
    skipped: firstRun.skipped,
    checkpoint: firstRun.checkpoint,
  });

  console.log(
    "[5/6] Executando sincronizacao repetida com mesmo conjunto de dados...",
  );
  const syncTwo = new ControlIdIncrementalSync({
    service,
    pageSize,
    order: { id: "asc" },
    checkpoint: syncOne.getCheckpoint(),
  });
  const secondRun = await syncTwo.run();

  const firstIds = (firstRun.items || [])
    .map((entry) => normalizeIdentity(entry.identity))
    .filter(Boolean);
  const secondIds = (secondRun.items || [])
    .map((entry) => normalizeIdentity(entry.identity))
    .filter(Boolean);
  const seenBefore = new Set(firstIds);
  const newIds = secondIds.filter((id) => !seenBefore.has(id));
  const duplicateIds = secondIds.filter((id) => seenBefore.has(id));

  console.log("resultado_segunda_sincronizacao:", {
    ok: secondRun.ok,
    count: secondRun.count,
    skipped: secondRun.skipped,
    checkpoint: secondRun.checkpoint,
    newIdsCount: newIds.length,
    duplicateIdsCount: duplicateIds.length,
  });

  console.log("[6/6] Avaliacao de paginação e checkpoint...");
  const checkpointBefore = syncOne.getCheckpoint();
  const checkpointAfter = syncTwo.getCheckpoint();
  const offsetDelta =
    Number(checkpointAfter.offset || 0) - Number(checkpointBefore.offset || 0);
  const checkpointStatus =
    offsetDelta > 0 ? "avancou" : offsetDelta === 0 ? "estavel" : "recuou";

  console.log("checkpoint_status:", checkpointStatus);
  console.log("checkpoint_delta_offset:", offsetDelta);
  console.log("riscos:", [
    "offset e order por id nao garantem ausencia de perda quando novos acessos chegam entre consultas",
    "a identidade confirmada neste codigo e 'id' apenas quando presente e nao vazio",
    "nao foi comprovada a monotonicidade global do id no firmware",
  ]);

  console.log("execucao concluida sem alteracoes no equipamento.");
}

main().catch((error) => {
  console.error("Falha no teste integrado de sincronizacao.");
  console.error("Codigo:", error.code || "UNEXPECTED_ERROR");
  console.error("Mensagem:", error.message);
  process.exitCode = 1;
});
