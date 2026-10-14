require("dotenv").config();

const { ControlIdClient } = require("../src/integrations/control-id");

function getProjectEnv() {
  const baseURL = process.env.CONTROL_ID_BASE_URL;
  const username = process.env.CONTROL_ID_USERNAME;
  const password = process.env.CONTROL_ID_PASSWORD;
  const timeoutMs = Number(process.env.CONTROL_ID_TIMEOUT_MS || 5000);

  if (!baseURL || !username || !password) {
    throw new Error(
      "Configure CONTROL_ID_BASE_URL, CONTROL_ID_USERNAME e CONTROL_ID_PASSWORD no .env antes da sondagem.",
    );
  }

  return { baseURL, username, password, timeoutMs };
}

function sanitizeMessage(message = "") {
  return String(message)
    .replace(/session/gi, "[redacted]")
    .replace(/token/gi, "[redacted]")
    .replace(/password/gi, "[redacted]")
    .replace(/login/gi, "[redacted]")
    .replace(/authorization/gi, "[redacted]")
    .replace(/cookie/gi, "[redacted]");
}

function summarizeFieldInfo(records) {
  const safeRecords = Array.isArray(records) ? records : [];
  const fields = new Map();

  for (const record of safeRecords) {
    if (!record || typeof record !== "object") {
      continue;
    }

    for (const key of Object.keys(record)) {
      const value = record[key];
      const type =
        value === null ? "null" : Array.isArray(value) ? "array" : typeof value;

      if (!fields.has(key) || fields.get(key) !== type) {
        fields.set(key, type);
      }
    }
  }

  return {
    fieldNames: Array.from(fields.keys()),
    fieldTypes: Array.from(fields.entries()).map(([name, type]) => ({
      name,
      type,
    })),
    identifiersPresent: safeRecords.filter((record) => {
      const value = record && record.id;
      return (
        value !== undefined && value !== null && String(value).trim() !== ""
      );
    }).length,
    identifiersMissing: safeRecords.filter((record) => {
      const value = record && record.id;
      return (
        value === undefined || value === null || String(value).trim() === ""
      );
    }).length,
  };
}

function parameterNamesFromPayload(payload = {}) {
  return Object.keys(payload || {});
}

async function probeRequest({ client, label, payload }) {
  console.log(`\n[${label}] Iniciando...`);
  console.log("payload_keys:", parameterNamesFromPayload(payload));

  try {
    const response = await client.loadObjects("access_logs", payload);
    const records = Array.isArray(response?.access_logs)
      ? response.access_logs
      : [];
    const fieldInfo = summarizeFieldInfo(records);

    console.log("status: OK");
    console.log("count:", records.length);
    console.log("field_names:", fieldInfo.fieldNames);
    console.log("field_types:", JSON.stringify(fieldInfo.fieldTypes));
    console.log("identifiers_present:", fieldInfo.identifiersPresent);
    console.log("identifiers_missing:", fieldInfo.identifiersMissing);

    return { label, ok: true, payload, count: records.length, records };
  } catch (error) {
    console.log("status: ERROR");
    console.log(
      "http_status:",
      error && typeof error.status === "number" ? error.status : "unknown",
    );
    console.log(
      "error_code:",
      error && error.code ? error.code : "UNEXPECTED_ERROR",
    );
    console.log(
      "message:",
      sanitizeMessage(error && error.message ? error.message : "unknown"),
    );
    console.log("payload_keys:", parameterNamesFromPayload(payload));

    return {
      label,
      ok: false,
      payload,
      error: {
        code: error && error.code,
        status: error && error.status,
        message: sanitizeMessage(error && error.message),
      },
    };
  }
}

async function main() {
  const { baseURL, username, password, timeoutMs } = getProjectEnv();
  const client = new ControlIdClient({
    baseURL,
    username,
    password,
    timeoutMs,
  });

  console.log("[0/1] Autenticando...");
  await client.login();
  console.log("sessao_autenticada: true");

  const matrix = [
    { label: "basic", payload: { object: "access_logs" } },
    { label: "limit_only", payload: { object: "access_logs", limit: 2 } },
    {
      label: "fields_only",
      payload: { object: "access_logs", fields: ["id", "event", "portal_id"] },
    },
    {
      label: "offset_limit",
      payload: { object: "access_logs", limit: 2, offset: 0 },
    },
    {
      label: "order_only",
      payload: { object: "access_logs", order: ["id ascending"] },
    },
    {
      label: "limit_fields_order",
      payload: {
        object: "access_logs",
        limit: 2,
        fields: ["id", "event", "portal_id"],
        order: ["id ascending"],
      },
    },
  ];

  const results = [];

  for (const item of matrix) {
    const result = await probeRequest({
      client,
      label: item.label,
      payload: item.payload,
    });
    results.push(result);

    if (!result.ok) {
      console.log(
        "\nInterrompendo sondagem na primeira etapa rejeitada pela API real.",
      );
      break;
    }
  }

  if (results.length > 0) {
    const success = results.filter((result) => result.ok);
    const failed = results.filter((result) => !result.ok);

    console.log("\nResumo da sondagem:");
    console.log("aceitas:", success.length);
    console.log("rejeitadas:", failed.length);

    for (const item of results) {
      if (item.ok) {
        console.log(item.label, "=> OK");
      } else {
        console.log(item.label, "=> REJEITADO");
      }
    }
  }
}

main().catch((error) => {
  console.error("Falha ao preparar a sondagem de access_logs.");
  console.error(
    "codigo:",
    error && error.code ? error.code : "UNEXPECTED_ERROR",
  );
  console.error(
    "mensagem:",
    sanitizeMessage(error && error.message ? error.message : "unknown"),
  );
  process.exitCode = 1;
});
