# Funcionalidades do projeto Portaria-IA

## Visão geral

Este projeto é um backend de portaria com foco em comunicação em tempo real e integração com sistemas externos. A arquitetura atual combina:

- servidor HTTP para gestão e endpoints administrativos
- serviço WebSocket para troca de mensagens entre clientes
- autenticação por handshake determinístico
- relay de mensagens entre dispositivos/peers
- integração com o equipamento Control iD/iDFace Pro
- preparação para integração com IA e processamento externo

---

## 1. Servidor principal

Arquivo principal:

- `server.js`
- `src/index.js`

### Função

O servidor gerencia a infraestrutura de sinalização para comunicação entre clientes conectados e também expõe endpoints REST para administradores e integrações.

### Funcionalidades principais

#### a) Health-check HTTP

Disponibiliza uma rota de verificação de saúde do sistema:

- `/signaling-health-check`

Essa rota responde com `OK` para confirmar que o backend está operacional.

#### b) Administração de conexões

Quando `ENABLE_ADMIN` está habilitado, há um endpoint:

- `/admin/connections`

Ele retorna:

- quantidade de clientes conectados
- lista de identificadores ativos

#### c) Push manual para cliente específico

Endpoint:

- `/admin/push`

Permite enviar uma mensagem manual para um cliente conectado, identificando alvo pelo `targetId`.

#### d) Integração com IA

Endpoint:

- `/ai/process`

Quando `AI_ENDPOINT` está configurado, o servidor repassa a requisição para um serviço externo de IA, enviando o payload em JSON e encaminhando a resposta ao cliente que originou a chamada.

---

## 2. Sistema de sinalização WebSocket

Arquivo principal:

- `src/index.js`

### Função

O backend estabelece um servidor WebSocket para permitir troca de mensagens em tempo real entre clientes autenticados.

### Fluxo principal

#### Handshake

O cliente envia um pacote do tipo:

- `HandshakeRequest`

Com:

- `email`
- `secret`

O servidor calcula um ID determinístico com base nesses dados e responde com:

- `HandshakeResponse`

Esse ID identifica o cliente na conexão ativa.

#### Relay de mensagens

Após autenticação, o cliente pode enviar mensagens do tipo:

- `Message`

Essas mensagens incluem:

- `sourceId`
- `targetId`
- `contentType`
- `contentJson`

O servidor valida o pacote e encaminha para o `targetId` correto.

#### Validações realizadas

- JSON válido
- cliente autenticado
- `sourceId` compatível com a conexão
- `targetId` existente
- payload com campos mínimos obrigatórios

#### Casos de erro

Quando há falha na validação, o servidor devolve um erro estruturado do tipo:

- `RelayError`

Com motivos como:

- `TARGET_NOT_FOUND`
- `MESSAGE_INVALID`

---

## 3. Integração com Control iD

Pastas e arquivos principais:

- `src/integrations/control-id/`
- `docs/integrations/control-id.md`

### Objetivo

Isolar a lógica de comunicação com o equipamento Control iD/iDFace Pro do restante da aplicação.

### Componentes

#### `control-id.errors.js`

Define erros específicos da integração, como:

- `ControlIdConnectionError`
- `ControlIdHttpError`
- `ControlIdAuthenticationError`
- `ControlIdResponseError`

Esses erros padronizam falhas de rede, HTTP, autenticação e resposta inválida.

#### `control-id.client.js`

Responsável por:

- autenticar no equipamento
- manter a sessão ativa
- enviar requisições HTTP
- validar JSON e status HTTP
- capturar falhas e transformar em erros padronizados

Ele usa `fetchImpl` para permitir testes simulados sem acesso real ao equipamento.

#### `control-id.adapter.js`

Expõe operações mais amigáveis para a aplicação, como:

- `getSystemInformation()`
- `getAccessLogs(options)`
- `getUsers(options)`

Essa camada evita que o restante do sistema precise conhecer detalhes internos do equipamento.

#### `index.js`

Arquivo de exportação pública do módulo, reunindo:

- cliente
- adaptador
- erros

---

## 4. Testes automatizados

Arquivos de teste:

- `tests/integrations/control-id/control-id.client.test.js`
- `tests/integrations/control-id/control-id.adapter.test.js`

### Função dos testes

Os testes simulam respostas do equipamento por meio de `fetchImpl`, evitando dependência do hardware físico.

### O que é validado

- login e armazenamento da sessão
- uso da sessão em requisições autenticadas
- rejeição de login sem sessão
- tratamento de erros HTTP
- tratamento de falhas de conexão
- consulta de logs e usuários via adaptador

---

## 5. Fluxo funcional do projeto

Em linhas gerais, o projeto trabalha assim:

1. clientes se conectam ao servidor WebSocket
2. fazem handshake para autenticar
3. trocam mensagens em tempo real por relay
4. a aplicação pode consultar dados de portaria e dispositivos externos
5. a integração Control iD fica isolada em um módulo dedicado
6. a camada de IA pode receber requisições externas quando configurada

---

## 6. Benefícios da arquitetura atual

- isolamento da integração externa
- teste sem equipamento físico
- clareza de responsabilidades por módulo
- melhor manutenção da lógica de portaria
- suporte a comunicação em tempo real e processamento semântico/IA

---

## 7. Observações importantes

- O projeto ainda está em evolução e a integração com o Control iD é tratada como uma camada isolada.
- O envio e o processamento de sinais em tempo real ficam separados da lógica de negócio e da integração com o equipamento.
- O uso de `.env` é essencial para credenciais e configuração do ambiente.

---

## 8. Documentação complementar

Já existe uma documentação específica sobre a integração Control iD:

- `docs/integrations/control-id.md`

Esta nova documentação complementa a anterior, oferecendo uma visão geral das funcionalidades do sistema como um todo.
