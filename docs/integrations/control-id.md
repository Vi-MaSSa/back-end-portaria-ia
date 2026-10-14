# Integração Control iD — iDFace Pro

## Objetivo

Isolar a comunicação HTTP com o equipamento Control iD da lógica de sinalização, da aplicação de portaria e das funcionalidades de IA.

## Status atual

### Validado com mock

- `login()` com sessão recebida
- rejeição de login sem sessão
- tratamento de resposta HTTP com erro
- tratamento de falha de conexão
- timeout
- resposta JSON inválida
- consulta de informações do sistema via sessão
- consulta de registros e usuários via adaptador

### Validado no equipamento real

- autenticação com `login.fcgi`
- consulta de informações do sistema
- consulta de `access_logs` com limite pequeno
- recebimento de campos do firmware sem expor dados pessoais

### Pendente

- validação remota de sessão do firmware
- logout remoto confirmado pelo dispositivo
- contrato oficial de endpoint de sessão, quando disponível no firmware instalado

## Arquitetura

- `control-id.client.js`: autenticação, sessão em memória e transporte HTTP.
- `control-id.adapter.js`: operações de leitura do dispositivo.
- `control-id.errors.js`: erros tipados da integração.
- `index.js`: ponto de entrada público da integração.
- `tests/integrations/control-id/`: testes com respostas simuladas.
- `scripts/test-control-id-live.cjs`: validação real do equipamento em modo somente leitura.

## Pré-requisitos

- Node.js com suporte a `fetch` e `node:test`.
- Equipamento Control iD acessível pela rede local.
- Usuário e senha válidos do equipamento.
- Arquivo `.env` configurado localmente; nunca versionado.

## Configuração

Use o arquivo de exemplo:

```bash
cp .env.example .env
```

O conteúdo esperado é:

```env
CONTROL_ID_BASE_URL=http://192.168.0.129
CONTROL_ID_USERNAME=seu_usuario
CONTROL_ID_PASSWORD=sua_senha
CONTROL_ID_TIMEOUT_MS=5000
```

Não versionar credenciais reais. O projeto já protege `.env` via `.gitignore`.

## Segurança

- Não imprimir senhas, tokens nem sessões.
- Não registrar corpos de requisição com credenciais.
- Não expor registros pessoais nos logs.
- Tratamento de erro HTTP ocorre antes do parse do corpo quando a resposta não é bem-sucedida.
- A sessão é mantida apenas em memória e limpa localmente sem afirmar logout remoto quando o contrato do firmware não foi confirmado.

## Exemplo de uso

```js
const {
  ControlIdClient,
  ControlIdAdapter,
} = require("../../src/integrations/control-id");

const client = new ControlIdClient({
  baseURL: process.env.CONTROL_ID_BASE_URL,
  username: process.env.CONTROL_ID_USERNAME,
  password: process.env.CONTROL_ID_PASSWORD,
  timeoutMs: Number(process.env.CONTROL_ID_TIMEOUT_MS || 5000),
});

const adapter = new ControlIdAdapter({ client });

const systemInformation = await adapter.getSystemInformation();
const accessLogs = await adapter.getAccessLogs({ limit: 5 });
```

## Operações confirmadas

- `getSystemInformation()`: consulta informações do sistema.
- `getAccessLogs(options)`: consulta registros de acesso.
- `getUsers(options)`: consulta usuários.

## Sincronização incremental em memória

A implementação em memória foi mantida em um módulo isolado, sem polling automático, sem banco, filas, WebSocket ou rotas HTTP.

### Contrato conservador

- usa a paginação do endpoint `load_objects.fcgi` por `limit` e `offset`;
- ordena por `id` em ordem ascendente quando o código da operação solicita paginação sequencial;
- considera somente `id`, `event` e `portal_id` como campos confirmados no código e nos testes;
- não presume que `id` é globalmente único em todos os contextos do firmware;
- descarta registros sem `id` confiável antes de emitir evento interno;
- mantém o checkpoint somente em memória e não persiste nem publica eventos.

### Limitação documentada

A sincronização incremental é uma camada segura de leitura e deduplicação em memória. Ela não foi validada no equipamento físico nesta tarefa, apenas em testes com mocks e no contrato já confirmado do cliente/adapter. Qualquer campo de acesso que não esteja explicitamente presente em `id`, `event` ou `portal_id` deve ser tratado como não confirmado, sem inferir significado.

## Sessão

### Comportamento implementado e confirmado

- `login()` realiza autenticação e armazena a sessão em memória.
- `request()` reaproveita a sessão para operações autenticadas.
- `clearSession()` limpa a sessão local.
- `validateSession()` verifica se existe uma sessão local válida em memória.
- `logout()` limpa a sessão local e informa que o fechamento remoto não foi confirmado.

### Comportamento pendente

- validação remota do estado da sessão no firmware
- logout remoto confirmado no servidor do equipamento
- qualquer contrato que exija endpoint específico de sessão ainda não foi declarado oficialmente no firmware validado

## Testes

### Unitários

```bash
npm test
```

Resultado observado:

```text
12 testes aprovados
0 falhas
```

### Teste real

```bash
node scripts/test-control-id-live.cjs
```

Resultado observado:

- autenticação com sucesso
- consulta de informações do sistema com sucesso
- consulta de `access_logs` com sucesso
- 5 registros retornados
- script finalizado com sucesso no ambiente disponível

## Limites desta versão

- não abre portas ou altera o estado do equipamento
- não executa cadastro, exclusão ou edição de usuários
- não altera configurações do firmware
- não implementa logout remoto como confirmação oficial do dispositivo
- não assume contrato de sessão que não foi documentado e validado

## Modo de operação

O adaptador não altera o modo de operação do iDFace Pro. Os testes reais foram restritos a leitura e autenticação.

## Documentação oficial

[https://www.controlid.com.br/docs/access-api-pt/](https://www.controlid.com.br/docs/access-api-pt/)
