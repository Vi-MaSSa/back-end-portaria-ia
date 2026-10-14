const { ControlIdClient } = require("./control-id.client");

class ControlIdAdapter {
  constructor({ client } = {}) {
    if (!(client instanceof ControlIdClient)) {
      throw new TypeError("client must be an instance of ControlIdClient");
    }

    this.client = client;
  }

  getSystemInformation() {
    return this.client.getSystemInformation();
  }

  getAccessLogs(options = {}) {
    return this.client.getAccessLogs(options);
  }

  getUsers(options = {}) {
    return this.client.getUsers(options);
  }
}

module.exports = { ControlIdAdapter };
