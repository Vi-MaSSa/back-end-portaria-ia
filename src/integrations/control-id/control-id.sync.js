class ControlIdIncrementalSync {
  constructor({
    service,
    pageSize = 50,
    checkpoint = null,
    order = { id: "asc" },
  } = {}) {
    if (!service || typeof service.getAccessRecords !== "function") {
      throw new TypeError(
        "service must expose getAccessRecords({ limit, offset, order, fields })",
      );
    }

    this.service = service;
    this.pageSize =
      Number.isFinite(Number(pageSize)) && Number(pageSize) > 0
        ? Number(pageSize)
        : 50;
    this.order = this.normalizeOrder(order);
    this.checkpoint = this.normalizeCheckpoint(checkpoint);
    this.processedIds = new Set();
  }

  normalizeOrder(order = { id: "asc" }) {
    if (!order || typeof order !== "object") {
      return { id: "asc" };
    }

    if (Object.prototype.hasOwnProperty.call(order, "id")) {
      return { id: order.id === "desc" ? "desc" : "asc" };
    }

    return { ...order };
  }

  normalizeCheckpoint(checkpoint = null) {
    if (!checkpoint || typeof checkpoint !== "object") {
      return { offset: 0, lastId: null };
    }

    const offsetValue = Number(checkpoint.offset ?? 0);
    const safeOffset = Number.isFinite(offsetValue) ? offsetValue : 0;

    return {
      offset: safeOffset,
      lastId: checkpoint.lastId ?? null,
    };
  }

  getCheckpoint() {
    return {
      offset: Number(this.checkpoint.offset || 0),
      lastId: this.checkpoint.lastId ?? null,
    };
  }

  getRecordIdentity(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    const rawId = record.id;
    if (rawId !== undefined && rawId !== null && String(rawId).trim() !== "") {
      return `id:${String(rawId)}`;
    }

    return null;
  }

  buildEvent(record) {
    const identity = this.getRecordIdentity(record);
    const knownFields = {};

    for (const key of ["id", "event", "portal_id"]) {
      if (Object.prototype.hasOwnProperty.call(record, key)) {
        knownFields[key] = record[key];
      }
    }

    const unknownKeys = Object.keys(record).filter(
      (key) => !["id", "event", "portal_id"].includes(key),
    );

    const event = {
      source: "control_id",
      collection: "access_logs",
      identity,
      ...knownFields,
    };

    if (unknownKeys.length > 0) {
      event.unknownFields = unknownKeys;
    }

    return event;
  }

  async run({ limit = this.pageSize, order = this.order } = {}) {
    const stageCheckpoint = this.normalizeCheckpoint(this.checkpoint);
    const stageSeen = new Set();
    const stageEvents = [];
    let offset = Number(stageCheckpoint.offset || 0);
    let skipped = 0;

    while (true) {
      let response;

      try {
        response = await this.service.getAccessRecords({
          limit,
          offset,
          order,
          fields: ["id", "event", "portal_id"],
        });
      } catch (error) {
        return {
          ok: false,
          source: "control_id",
          collection: "access_logs",
          count: 0,
          items: [],
          checkpoint: this.getCheckpoint(),
          skipped,
          error,
        };
      }

      const items = Array.isArray(response?.items) ? response.items : [];

      if (items.length === 0) {
        break;
      }

      for (const item of items) {
        const identity = this.getRecordIdentity(item);

        if (!identity) {
          skipped += 1;
          continue;
        }

        if (this.processedIds.has(identity) || stageSeen.has(identity)) {
          continue;
        }

        const event = this.buildEvent(item);
        stageEvents.push(event);
        stageSeen.add(identity);
      }

      const nextOffset = offset + items.length;
      stageCheckpoint.offset = nextOffset;

      const maxId = items
        .map((item) => item?.id)
        .filter(
          (id) => id !== undefined && id !== null && String(id).trim() !== "",
        )
        .sort((left, right) =>
          String(left).localeCompare(String(right), undefined, {
            numeric: true,
          }),
        )
        .at(-1);

      if (
        maxId !== undefined &&
        maxId !== null &&
        String(maxId).trim() !== ""
      ) {
        const numericId = Number(maxId);
        stageCheckpoint.lastId = Number.isFinite(numericId)
          ? numericId
          : String(maxId);
      }

      if (items.length < limit) {
        break;
      }

      offset = nextOffset;
    }

    if (stageEvents.length > 0) {
      for (const event of stageEvents) {
        if (event.identity) {
          this.processedIds.add(event.identity);
        }
      }
    }

    this.checkpoint = { ...stageCheckpoint };

    return {
      ok: true,
      source: "control_id",
      collection: "access_logs",
      count: stageEvents.length,
      items: stageEvents,
      checkpoint: this.getCheckpoint(),
      skipped,
    };
  }
}

module.exports = { ControlIdIncrementalSync };
