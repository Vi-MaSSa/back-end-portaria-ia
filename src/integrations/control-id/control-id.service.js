const { ControlIdClient } = require("./control-id.client");
const { ControlIdAdapter } = require("./control-id.adapter");

const SENSITIVE_KEYS = new Set([
  "session",
  "token",
  "secret",
  "password",
  "login",
  "username",
  "credentials",
  "authorization",
  "cookie",
  "set-cookie",
]);

function sanitizeDetails(details = {}) {
  if (!details || typeof details !== "object") {
    return {};
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = String(key).toLowerCase();

    if (SENSITIVE_KEYS.has(lowerKey)) {
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function sanitizeError(error) {
  if (!error || typeof error !== "object") {
    return error;
  }

  const safeError = new Error(
    String(error.message || "Control iD integration error").replace(
      /(?:session|token|secret|password|login|username|credentials|authorization|cookie)/gi,
      "[redacted]",
    ),
  );

  safeError.name = error.name || "ControlIdError";
  safeError.code = error.code || "ERROR";
  safeError.details = sanitizeDetails(error.details);

  if (typeof error.status === "number") {
    safeError.status = error.status;
  }

  return safeError;
}

class ControlIdService {
  constructor({ client, adapter } = {}) {
    if (client && typeof client.getSystemInformation === "function") {
      this.client = client;
    } else if (client instanceof ControlIdClient) {
      this.client = client;
    } else if (client) {
      throw new TypeError("client must implement the Control iD interface");
    } else {
      this.client = new ControlIdClient({
        baseURL: process.env.CONTROL_ID_BASE_URL,
        username: process.env.CONTROL_ID_USERNAME,
        password: process.env.CONTROL_ID_PASSWORD,
        timeoutMs: Number(process.env.CONTROL_ID_TIMEOUT_MS || 5000),
      });
    }

    if (adapter && typeof adapter.getSystemInformation === "function") {
      this.adapter = adapter;
    } else if (this.client instanceof ControlIdClient) {
      this.adapter = new ControlIdAdapter({ client: this.client });
    } else {
      this.adapter = {
        getSystemInformation: (...args) =>
          this.client.getSystemInformation(...args),
        getAccessLogs: (...args) => this.client.getAccessLogs(...args),
        getUsers: (...args) => this.client.getUsers(...args),
      };
    }
  }

  async getEquipmentInfo() {
    try {
      const data = await this.client.getSystemInformation();
      return {
        ok: true,
        source: "control_id",
        data,
      };
    } catch (error) {
      throw sanitizeError(error);
    }
  }

  async getStatus() {
    try {
      const session = await this.client.validateSession();
      const system = await this.client.getSystemInformation();

      return {
        ok: true,
        source: "control_id",
        status: {
          session: session.valid ? "valid" : "missing",
          firmware: system && system.version ? system.version : null,
          online:
            system && typeof system.online === "boolean" ? system.online : null,
        },
      };
    } catch (error) {
      throw sanitizeError(error);
    }
  }

  async getAccessRecords({
    limit = 50,
    offset = 0,
    fields,
    where,
    order,
  } = {}) {
    try {
      const payload = { limit, offset };
      if (Array.isArray(fields)) payload.fields = fields;
      if (where) payload.where = where;
      if (order) payload.order = order;

      const result = await this.client.getAccessLogs(payload);
      const items = Array.isArray(result?.access_logs)
        ? result.access_logs.map((entry) => ({
            ...entry,
            raw: entry,
          }))
        : [];

      return {
        ok: true,
        source: "control_id",
        collection: "access_logs",
        count: items.length,
        limit,
        offset,
        items,
      };
    } catch (error) {
      throw sanitizeError(error);
    }
  }

  async getUsers({ limit = 50, offset = 0, fields, where, order } = {}) {
    try {
      const payload = { limit, offset };
      if (Array.isArray(fields)) payload.fields = fields;
      if (where) payload.where = where;
      if (order) payload.order = order;

      const result = await this.client.getUsers(payload);
      const items = Array.isArray(result?.users)
        ? result.users.map((entry) => ({
            ...entry,
            raw: entry,
          }))
        : [];

      return {
        ok: true,
        source: "control_id",
        collection: "users",
        count: items.length,
        limit,
        offset,
        items,
      };
    } catch (error) {
      throw sanitizeError(error);
    }
  }
}

module.exports = { ControlIdService };
