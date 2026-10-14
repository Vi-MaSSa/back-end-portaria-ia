const {
  ControlIdConnectionError,
  ControlIdHttpError,
  ControlIdAuthenticationError,
  ControlIdResponseError,
} = require("./control-id.errors");

class ControlIdClient {
  constructor({
    baseURL,
    username,
    password,
    timeoutMs = 5000,
    fetchImpl = globalThis.fetch,
  } = {}) {
    if (!baseURL) throw new TypeError("baseURL is required");
    if (!username) throw new TypeError("username is required");
    if (!password) throw new TypeError("password is required");
    if (typeof fetchImpl !== "function") {
      throw new TypeError("A compatible fetch implementation is required");
    }

    this.baseURL = baseURL.replace(/\/+$/, "");
    this.username = username;
    this.password = password;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.session = null;
  }

  async request(path, { method = "POST", body, authenticated = true } = {}) {
    if (authenticated && !this.session) {
      await this.login();
    }

    const url = new URL(`${this.baseURL}/${path.replace(/^\/+/, "")}`);

    if (authenticated) {
      url.searchParams.set("session", this.session);
    }

    let response;

    try {
      response = await this.fetchImpl(url, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ControlIdConnectionError(
        error.name === "TimeoutError"
          ? "Control iD request timed out"
          : "Could not connect to Control iD",
        { cause: error.name },
      );
    }

    if (!response || typeof response.ok !== "boolean") {
      throw new ControlIdResponseError(
        "Control iD returned an invalid response object",
        { endpoint: path },
      );
    }

    if (!response.ok) {
      throw new ControlIdHttpError(response.status, { endpoint: path });
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new ControlIdResponseError(
        "Control iD returned a non-JSON response",
        { endpoint: path },
      );
    }

    if (data && data.error) {
      throw new ControlIdResponseError("Control iD returned an API error", {
        endpoint: path,
      });
    }

    return data;
  }

  async login() {
    let data;

    try {
      data = await this.request("login.fcgi", {
        authenticated: false,
        body: {
          login: this.username,
          password: this.password,
        },
      });
    } catch (error) {
      if (error.code === "HTTP_ERROR" || error.code === "INVALID_RESPONSE") {
        throw error;
      }
      throw error;
    }

    if (!data || typeof data.session !== "string" || !data.session) {
      throw new ControlIdAuthenticationError(
        "Control iD login response did not contain a session",
      );
    }

    this.session = data.session;
    return this.session;
  }

  async getSystemInformation() {
    return this.request("system_information.fcgi");
  }

  async getAccessLogs(options = {}) {
    return this.loadObjects("access_logs", options);
  }

  async getUsers(options = {}) {
    return this.loadObjects("users", options);
  }

  async loadObjects(object, options = {}) {
    if (!object || typeof object !== "string") {
      throw new TypeError("object must be a non-empty string");
    }

    return this.request("load_objects.fcgi", {
      body: { object, ...options },
    });
  }

  async checkSessionValidity() {
    if (
      !this.session ||
      typeof this.session !== "string" ||
      !this.session.trim()
    ) {
      return { session_is_valid: false };
    }

    const url = new URL(`${this.baseURL}/session_is_valid.fcgi`);
    url.searchParams.set("session", this.session);

    let response;

    try {
      response = await this.fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      throw new ControlIdConnectionError(
        error.name === "TimeoutError"
          ? "Control iD request timed out"
          : "Could not connect to Control iD",
        { cause: error.name },
      );
    }

    if (!response || typeof response.ok !== "boolean") {
      throw new ControlIdResponseError(
        "Control iD returned an invalid response object",
        { endpoint: "session_is_valid.fcgi" },
      );
    }

    if (!response.ok) {
      throw new ControlIdHttpError(response.status, {
        endpoint: "session_is_valid.fcgi",
      });
    }

    let data;

    try {
      data = await response.json();
    } catch {
      throw new ControlIdResponseError(
        "Control iD returned a non-JSON response",
        { endpoint: "session_is_valid.fcgi" },
      );
    }

    if (data && data.error) {
      throw new ControlIdResponseError("Control iD returned an API error", {
        endpoint: "session_is_valid.fcgi",
      });
    }

    return data;
  }

  async validateSession() {
    if (
      !this.session ||
      typeof this.session !== "string" ||
      !this.session.trim()
    ) {
      return {
        valid: false,
        source: "local",
        message: "No session is currently stored in memory.",
      };
    }

    return {
      valid: true,
      source: "local",
      session: this.session,
    };
  }

  async logout({ remote = false } = {}) {
    const previousSession = this.session;
    this.session = null;

    return {
      localCleared: true,
      remoteConfirmed: false,
      remoteRequested: remote,
      previousSession,
      message: remote
        ? "Remote logout was not confirmed by the device; only the local session cache was cleared."
        : "Local session cleared without remote logout confirmation.",
    };
  }

  clearSession() {
    this.session = null;
  }
}

module.exports = { ControlIdClient };
