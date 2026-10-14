import { startWebSocketServer } from "./src/signaling/websocket-server.js";
import { WebRTCSessionManager } from "./src/signaling/webrtc-session.js";

const manager = new WebRTCSessionManager();

startWebSocketServer(3001, (ws, data) => {
  const { type, sessionId } = data;

  switch (type) {
    case "create-session":
      manager.createSession(sessionId, ws);
      break;

    case "offer":
    case "answer":
    case "ice-candidate":
      manager.sendTo(sessionId, data);
      break;

    default:
      console.log("Mensagem desconhecida:", data);
  }
});
