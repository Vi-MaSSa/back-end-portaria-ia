require("dotenv").config();

const {
  ControlIdClient,
  ControlIdAdapter,
} = require("../src/integrations/control-id");

async function main() {
  const baseURL = process.env.CONTROL_ID_BASE_URL;
  const username = process.env.CONTROL_ID_USERNAME;
  const password = process.env.CONTROL_ID_PASSWORD;
  const timeoutMs = Number(process.env.CONTROL_ID_TIMEOUT_MS || 5000);

  if (!baseURL || !username || !password) {
    throw new Error(
      "Configure CONTROL_ID_BASE_URL, CONTROL_ID_USERNAME e CONTROL_ID_PASSWORD no .env",
    );
  }

  const client = new ControlIdClient({
    baseURL,
    username,
    password,
    timeoutMs,
  });

  const adapter = new ControlIdAdapter({ client });

  console.log("1/4 - Autenticando no Control iD...");
  await client.login();
  console.log("Autenticacao concluida. Sessao omitida por seguranca.");

  console.log("2/4 - Validando a sessão documentada...");
  const sessionStatus = await client.checkSessionValidity();
  console.log("Endpoint: session_is_valid.fcgi");
  console.log("Metodo: POST");
  console.log("Parametros: { session: <omitido> }");
  console.log("Resultado: ", sessionStatus);

  console.log("3/4 - Consultando informacoes do sistema...");
  const system = await adapter.getSystemInformation();
  console.log("Endpoint: system_information.fcgi");
  console.log("Metodo: POST");
  console.log("Parametros: {}");
  console.log("Campos recebidos:", Object.keys(system));

  console.log("4/4 - Consultando usuarios e registros de acesso...");
  const users = await adapter.getUsers({ limit: 5 });
  const logs = await adapter.getAccessLogs({ limit: 5 });

  const userRows = Array.isArray(users.users) ? users.users : [];
  const logRows = Array.isArray(logs.access_logs) ? logs.access_logs : [];

  console.log("Endpoint: load_objects.fcgi");
  console.log("Metodo: POST");
  console.log("Parametros: { object: 'users', limit: 5 }");
  console.log("Quantidade de usuarios retornados:", userRows.length);
  console.log("Parametros: { object: 'access_logs', limit: 5 }");
  console.log("Quantidade de registros retornados:", logRows.length);

  console.log("Teste de leitura documentada finalizado.");
}

main().catch((error) => {
  console.error("Falha no teste Control iD.");
  console.error("Codigo:", error.code || "UNEXPECTED_ERROR");
  console.error("Mensagem:", error.message);
  process.exitCode = 1;
});
