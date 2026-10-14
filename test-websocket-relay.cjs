
const WebSocket = require("ws");

const clients = {};
let receivedByB = false;

function connect(name, email, secret) {
  const ws = new WebSocket("ws://127.0.0.1:3000");
  clients[name] = { ws };

  ws.on("open", () => {
    ws.send(JSON.stringify({
      typeName: "HandshakeRequest",
      email,
      secret
    }));
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    console.log(`[${name}]`, JSON.stringify(msg));

    if (msg.typeName === "HandshakeResponse" && msg.id) {
      clients[name].id = msg.id;

      if (name === "cliente-B") {
        const a = clients["cliente-A"];

        a.ws.send(JSON.stringify({
          typeName: "Message",
          sourceId: a.id,
          targetId: clients[name].id,
          contentType: "test.ping",
          contentJson: {
            message: "Teste de encaminhamento"
          }
        }));
      }
    }

    if (
      name === "cliente-B" &&
      msg.typeName === "Message" &&
      msg.contentType === "test.ping"
    ) {
      receivedByB = true;
      console.log("SUCESSO: mensagem encaminhada de A para B.");
      closeClients();
    }
  });

  ws.on("error", (err) => {
    console.error(`[${name}] Erro:`, err.message);
  });
}

function closeClients() {
  for (const client of Object.values(clients)) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close();
    }
  }
}

connect("cliente-A", "cliente-a@portaria.local", "teste-a-temporario");
connect("cliente-B", "cliente-b@portaria.local", "teste-b-temporario");

setTimeout(() => {
  if (!receivedByB) {
    console.error("FALHA: mensagem não foi confirmada no cliente B.");
  }
  closeClients();
  process.exitCode = receivedByB ? 0 : 1;
}, 5000);
