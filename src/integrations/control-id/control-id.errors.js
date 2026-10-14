class ControlIdError extends Error {
  constructor(message, code, details = {}) {
    super(message);
    this.name = "ControlIdError";
    this.code = code;
    this.details = details;
  }
}

class ControlIdConnectionError extends ControlIdError {
  constructor(message, details = {}) {
    super(message, "CONNECTION_ERROR", details);
    this.name = "ControlIdConnectionError";
  }
}

class ControlIdHttpError extends ControlIdError {
  constructor(status, details = {}) {
    super(`Control iD returned HTTP ${status}`, "HTTP_ERROR", details);
    this.name = "ControlIdHttpError";
    this.status = status;
  }
}

class ControlIdAuthenticationError extends ControlIdError {
  constructor(message = "Control iD authentication failed", details = {}) {
    super(message, "AUTHENTICATION_ERROR", details);
    this.name = "ControlIdAuthenticationError";
  }
}

class ControlIdResponseError extends ControlIdError {
  constructor(message, details = {}) {
    super(message, "INVALID_RESPONSE", details);
    this.name = "ControlIdResponseError";
  }
}

module.exports = {
  ControlIdError,
  ControlIdConnectionError,
  ControlIdHttpError,
  ControlIdAuthenticationError,
  ControlIdResponseError,
};
