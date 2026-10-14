// index.js - Servidor de Sinalização WebRTC (Express + WS)
// Dependências: express, ws, dotenv, crypto

require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const http = require("http");
const WebSocket = require("ws");

// ENV
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 8080);
const SALT = process.env.SALT || "change-me";
const ENABLE_ADMIN = process.env.ENABLE_ADMIN === "true";
const AI_ENDPOINT = process.env.AI_ENDPOINT || null;
const AI_API_KEY = process.env.AI_API_KEY || null;

const now = () => new Date().toISOString();

// -----------------------------
// Message Schemas
// -----------------------------
function HandshakeRequest(email, secret) {
  this.typeName = "HandshakeRequest";
  this.email = email;
  this.secret = secret;
}

function HandshakeResponse(id, error) {
  this.typeName = "HandshakeResponse";
  this.id = id || null;
  this.error = error || null;
}

function Message(sourceId, targetId, contentType, contentJson) {
  this.typeName = "Message";
  this.sourceId = sourceId;
  this.targetId = targetId;
  this.contentType = contentType;
  this.contentJson = contentJson;
}

function RelayError(reason, message) {
  this.typeName = "RelayError";
  this.reason = reason;
  this.message = message;
}

const RelayErrorReason = {
  TARGET_NOT_FOUND: "TARGET_NOT_FOUND",
  MESSAGE_INVALID: "MESSAGE_INVALID",
};

// -----------------------------
// Utils
// -----------------------------

// ID determinístico baseado em email + secret
function computeId(email, secret) {
  return crypto
    .createHash("sha256")
    .update(`${email}|${secret}|${SALT}`)
    .digest("hex");
}

function sendJson(ws, obj) {
  try {
    ws.send(JSON.stringify(obj));
  } catch (err) {
    console.error(`${now()} - Failed to send:`, err.message);
  }
}

function validateRelayMessage(msg) {
  return msg.sourceId && msg.targetId && msg.contentType && msg.contentJson;
}

// -----------------------------
// Armazenamento de conexões
// -----------------------------
const idConnectionMap = new Map(); // id → ws
const wsIdMap = new WeakMap(); // ws → id

// -----------------------------
// EXPRESS
// -----------------------------
const app = express();
app.use(express.json());

// Health-check
app.get("/signaling-health-check", (req, res) => res.send("OK"));

// Admin (opcional)
if (ENABLE_ADMIN) {
  app.get("/admin/connections", (req, res) => {
    res.json({
      count: idConnectionMap.size,
      peers: [...idConnectionMap.keys()],
    });
  });
}

// Push manual
app.post("/admin/push", (req, res) => {
  const { targetId, contentType, contentJson } = req.body;

  if (!targetId || !contentType) {
    return res.status(400).json({ error: "targetId and contentType required" });
  }

  const ws = idConnectionMap.get(targetId);
  if (!ws) return res.status(404).json({ error: "target not connected" });

  sendJson(ws, new Message("server", targetId, contentType, contentJson || {}));

  res.json({ ok: true });
});

// AI Forwarding
app.post("/ai/process", async (req, res) => {
  if (!AI_ENDPOINT) {
    return res.status(503).json({ error: "AI integration not enabled" });
  }

  try {
    const response = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(AI_API_KEY ? { Authorization: `Bearer ${AI_API_KEY}` } : {}),
      },
      body: JSON.stringify(req.body),
    });

    res.json(await response.json());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -----------------------------
// HTTP + WebSocket server
// -----------------------------
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// -----------------------------
// WebSocket Logic
// -----------------------------
wss.on("connection", (ws, req) => {
  const ip = req.socket.remoteAddress;
  console.log(`${now()} - WS connected from ${ip}`);

  ws.on("message", (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return sendJson(
        ws,
        new RelayError(RelayErrorReason.MESSAGE_INVALID, "Invalid JSON")
      );
    }

    // -------------------------
    // Handshake
    // -------------------------
    if (msg.typeName === "HandshakeRequest") {
      const { email, secret } = msg;

      if (!email || !secret) {
        return sendJson(
          ws,
          new HandshakeResponse(null, "Email/secret missing")
        );
      }

      const id = computeId(email, secret);

      idConnectionMap.set(id, ws);
      wsIdMap.set(ws, id);

      console.log(`${now()} - Handshake OK id=${id} email=${email}`);
      return sendJson(ws, new HandshakeResponse(id));
    }

    // -------------------------
    // Relay Message
    // -------------------------
    if (msg.typeName === "Message") {
      const sourceId = wsIdMap.get(ws);

      if (!sourceId) {
        return sendJson(
          ws,
          new RelayError(RelayErrorReason.MESSAGE_INVALID, "Not authenticated")
        );
      }

      if (msg.sourceId !== sourceId) {
        return sendJson(
          ws,
          new RelayError(RelayErrorReason.MESSAGE_INVALID, "sourceId mismatch")
        );
      }

      if (!validateRelayMessage(msg)) {
        return sendJson(
          ws,
          new RelayError(RelayErrorReason.MESSAGE_INVALID, msg)
        );
      }

      const targetWs = idConnectionMap.get(msg.targetId);
      if (!targetWs) {
        return sendJson(
          ws,
          new RelayError(RelayErrorReason.TARGET_NOT_FOUND, msg)
        );
      }

      console.log(
        `${now()} - RELAY ${msg.contentType} ${msg.sourceId} -> ${msg.targetId}`
      );
      return sendJson(targetWs, msg);
    }

    // Unknown type
    console.warn(`${now()} - Unknown typeName: ${msg.typeName}`);
  });

  // Disconnect
  ws.on("close", () => {
    const id = wsIdMap.get(ws);
    if (id) {
      idConnectionMap.delete(id);
      console.log(`${now()} - Disconnected id=${id}`);
    }
    wsIdMap.delete(ws);
  });
});

// -----------------------------
// Start server
// -----------------------------
server.listen(PORT, HOST, () => {
  console.log(`${now()} - WebRTC Signaling Server ON → http://${HOST}:${PORT}`);
});
