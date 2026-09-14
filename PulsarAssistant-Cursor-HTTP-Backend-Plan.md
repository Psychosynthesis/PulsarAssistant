# План добавления Cursor HTTP backend в PulsarAssistant

## Цель

Добавить в `PulsarAssistant` третий тип агента:

```text
type: "cursor"
```

который работает напрямую с **Cursor Cloud Agents HTTP API** и не требует установки Cursor CLI / ACP-клиента на локальной машине.

Итоговая архитектура:

```text
PulsarAssistantView
        |
        v
   AgentSession
        |
        +-- BuiltinBackend      type: "openai"
        +-- AcpCliBackend       type: "acp"
        +-- CursorBackend       type: "cursor"
                |
                v
        src/cursorClient/
                |
                +-- Cursor HTTP API
                +-- Cursor SSE
                +-- repository validation
                +-- model loading
```

Ключевой принцип: весь Cursor-specific код, кроме самого `CursorBackend`, находится в отдельной папке:

```text
src/cursorClient/
```

`src/session/backends/cursor-backend.ts` только адаптирует Cursor API к существующему интерфейсу `AgentBackend`.

---

# 1. Ограничение Cursor Cloud Agents

Cursor HTTP API запускает **Cloud Agent**. Он работает не с локальной директорией Pulsar, а с репозиторием, который Cursor может клонировать в свою облачную VM.

Следовательно:

```text
локальный Pulsar project
        |
        +-- используется для определения репозитория/ветки
        |
        X  Cursor не читает его working tree напрямую
        |
        v
remote repository, доступный Cursor
        |
        v
Cursor Cloud VM
```

Отсюда три обязательные проверки.

## 1.1. У локального проекта должен быть remote

Для первой версии backend работает только с локальным проектом, который связан с удалённым репозиторием.

Определяем `origin`:

```bash
git remote get-url origin
```

Если `origin` отсутствует:

```text
Cursor backend cannot start: this project has no origin remote.
Cursor Cloud Agents require a remote repository accessible to Cursor.
```

Не запускать no-repo agent: тогда Cursor не будет работать над кодом открытого проекта.

## 1.2. Репозиторий должен быть доступен самому Cursor

Недостаточно просто взять `origin` и отправить его в `POST /v1/agents`.

Перед созданием Cloud Agent нужно проверить repository через:

```http
GET https://api.cursor.com/v1/repositories
Authorization: Bearer <apiKey>
```

Cursor возвращает список доступных репозиториев:

```json
{
  "items": [
    {
      "url": "https://github.com/owner/repository"
    }
  ]
}
```

Backend должен:

1. получить локальный `origin`;
2. нормализовать URL;
3. получить список репозиториев, доступных Cursor;
4. нормализовать URL из Cursor;
5. найти точное совпадение;
6. только после этого разрешить создание Cloud Agent.

Если совпадения нет:

```text
Cursor does not have access to this repository:

https://github.com/owner/repository

Connect the repository to Cursor before using the Cursor backend.
```

Важно: в `POST /v1/agents` передавать URL из подтверждённой записи Cursor, а не исходную строку из `.git/config`.

## 1.3. `/v1/repositories` нельзя дёргать постоянно

У Cursor для этого endpoint строгий rate limit:

```text
1 request / user / minute
30 requests / user / hour
```

Запрос также может выполняться долго.

Нужен runtime cache:

```ts
type RepositoryCache = {
  loadedAt: number;
  urls: Set<string>;
};
```

TTL для начала:

```text
5 минут
```

Алгоритм:

```text
если cache существует и моложе 5 минут:
    использовать cache
иначе:
    GET /v1/repositories
    сохранить результат
```

Постоянный disk-cache на первом этапе не нужен.

---

# 2. Локальные изменения и локальные коммиты

Это отдельная проблема от repository access.

Cursor Cloud Agent клонирует remote repository и поэтому не видит:

- незакоммиченные изменения;
- untracked-файлы;
- локальные коммиты, которые не были push;
- локальную ветку, отсутствующую на remote.

Перед первым Cursor prompt backend должен проверить git-состояние.

Минимальный набор проверок:

```bash
git status --porcelain
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
git ls-remote --heads origin <branch>
```

## 2.1. Первая версия ничего автоматически не push

Backend не должен самостоятельно:

- делать commit;
- делать push;
- создавать временную ветку;
- stash'ить изменения;
- менять текущую ветку пользователя.

Если есть dirty working tree:

```text
Cursor cannot see local uncommitted changes.
Commit and push the changes before starting a Cursor Cloud session.
```

Если текущая ветка отсутствует на remote:

```text
The current local branch is not available on the remote repository.
Push the branch before starting a Cursor Cloud session.
```

Если remote branch существует, сравнить локальный `HEAD` и remote SHA.

Без изменения локального repo это можно сделать через:

```bash
git rev-parse HEAD
git ls-remote origin refs/heads/<branch>
```

Если SHA отличаются:

```text
The local branch does not match the remote branch.
Push or update the branch before starting Cursor.
```

Это блокирует одновременно:

- локальные непушенные commits;
- remote commits, которых нет локально;
- разошедшиеся ветки.

Автоматический temporary branch/push можно добавить отдельной задачей позже.

---

# 3. Конфигурация Cursor

Базовый пользовательский конфиг:

```cson
"*":
  "pulsar-assistant":
    agents:
      cursor:
        type: "cursor"
        name: "Cursor"
        baseUrl: "https://api.cursor.com/v1"
        apiKey: "YOUR_CURSOR_API_KEY"
        defaultModel: "composer-2"
        mode: "agent"
        autoCreatePR: false
        workOnCurrentBranch: false
```

На первом этапе **не добавлять** `repoUrl` и `startingRef` в config.

Backend должен работать именно с проектом, открытым в Pulsar, а не позволять конфигом случайно привязать панель проекта A к repository B.

Если override понадобится позже — добавить отдельной функцией.

---

# 4. Не добавлять Cursor-поля в один широкий `Agent`

Отдельный backend не освобождает registry от знания о `type: "cursor"`: `agent-config.ts` всё равно должен определить тип конфигурации и построить соответствующий `LaunchTarget`.

Но не нужно добавлять Cursor-only поля в существующий широкий интерфейс как пачку optional-полей.

Вместо этого сделать discriminated union.

## 4.1. Тип агента

В `src/agent-config.ts`:

```ts
export type AgentType = "openai" | "acp" | "cursor";
```

## 4.2. Базовая часть

```ts
type BaseAgentConfig = {
  name: string;
};
```

## 4.3. OpenAI config

```ts
export type OpenAiAgentConfig = BaseAgentConfig & {
  type: "openai";
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  model?: string;
  modelsUrl?: string;
  stream?: boolean;
};
```

## 4.4. ACP config

```ts
export type AcpAgentConfig = BaseAgentConfig & {
  type: "acp";
  command: string;
};
```

## 4.5. Cursor config

```ts
export type CursorAgentConfig = BaseAgentConfig & {
  type: "cursor";
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  mode?: "agent" | "plan";
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
};
```

## 4.6. Общий registry type

```ts
export type Agent =
  | OpenAiAgentConfig
  | AcpAgentConfig
  | CursorAgentConfig;
```

Таким образом registry знает о Cursor, но Cursor-поля не загрязняют OpenAI/ACP.

---

# 5. Полностью удалить `apiKeyEnv`

`apiKeyEnv` больше не поддерживать нигде.

**Миграции не делать.**

Старый конфиг:

```cson
apiKeyEnv: "OPENAI_API_KEY"
```

после изменения считается неподдерживаемым.

Единственный допустимый источник ключа:

```cson
apiKey: "..."
```

## 5.1. Что удалить из `src/agent-config.ts`

Удалить поле:

```ts
apiKeyEnv?: string;
```

Удалить функцию:

```ts
resolveApiKey(...)
```

Убрать `env` из сигнатуры `toLaunchTarget()`.

Было концептуально:

```ts
toLaunchTarget(id, agent, process.env, model)
```

Должно стать:

```ts
toLaunchTarget(id, agent, model)
```

Для OpenAI/Cursor брать только:

```ts
const apiKey = optionalString(agent.apiKey);
```

Если ключ отсутствует — ошибка.

Никакого fallback на `process.env`.

## 5.2. Обновить тесты

Из `test/agent-config.test.mjs` удалить:

- импорт `resolveApiKey`;
- тесты чтения ключа из env;
- тест `direct apiKey wins over env`;
- все `apiKeyEnv` в fixtures.

Тестовые конфиги перевести на:

```ts
apiKey: "secret"
```

---

# 6. Provider-specific `LaunchTarget`

Оставить union:

```ts
export type LaunchTarget =
  | OpenaiLaunchTarget
  | AcpLaunchTarget
  | CursorLaunchTarget;
```

Новый Cursor target:

```ts
export type CursorLaunchTarget = {
  id: string;
  name: string;
  kind: "cursor";

  baseUrl: string;
  apiKey: string;
  model: string;

  mode: "agent" | "plan";
  autoCreatePR: boolean;
  workOnCurrentBranch: boolean;
};
```

Defaults:

```text
baseUrl              https://api.cursor.com/v1
mode                 agent
autoCreatePR         false
workOnCurrentBranch  false
```

`toLaunchTarget()` создаёт `CursorLaunchTarget` только из `CursorAgentConfig`.

---

# 7. Изменить `groupAgents()`

Добавить третью группу.

Порядок:

```text
openai
cursor
acp
```

UI labels:

```text
openai -> API
cursor -> Cursor
acp    -> ACP
```

Cursor не объединять с обычным API: семантика и lifecycle другие.

---

# 8. Создать `src/cursorClient/`

Весь Cursor transport/support код складывать сюда:

```text
src/
  cursorClient/
    client.ts
    types.ts
    sse.ts
    repository.ts
    index.ts
```

Не создавать Cursor-specific transport files непосредственно в `src/`.

Сам backend остаётся здесь:

```text
src/session/backends/cursor-backend.ts
```

---

# 9. `src/cursorClient/types.ts`

Файл содержит только Cursor API types.

Он не должен импортировать:

- `AgentBackend`;
- `PulsarAssistantView`;
- `EditorBackend`;
- ACP `SessionUpdate`.

Примерные группы типов:

```ts
export type CursorModel = { ... };
export type CursorRepository = { ... };
export type CursorAgent = { ... };
export type CursorRun = { ... };
export type CursorStreamEvent = ...;
```

Точные string enum значения брать из фактической схемы Cursor API, не придумывать.

Для входящих JSON использовать defensive parsing/checking: ответ внешнего API нельзя считать корректным только потому, что TypeScript type так объявлен.

---

# 10. `src/cursorClient/client.ts`

Создать:

```ts
export class CursorClient
```

Constructor:

```ts
new CursorClient({
  baseUrl,
  apiKey,
  fetch?,
})
```

Методы первой версии:

```ts
listModels()
listRepositories()

createAgent()
getAgent()

createRun()
getRun()
streamRun()

cancelRun()

archiveAgent()
unarchiveAgent()
```

Permanent delete в backend не использовать.

---

# 11. Общий HTTP helper

Внутри `CursorClient` сделать один приватный request helper.

Он отвечает за:

- `baseUrl`;
- `Authorization`;
- `Content-Type`;
- JSON serialization;
- JSON parsing;
- `AbortSignal`;
- HTTP errors;
- сохранение raw body ошибки.

Headers:

```http
Authorization: Bearer <apiKey>
Content-Type: application/json
```

Не размазывать auth-код по endpoint methods.

---

# 12. `CursorApiError`

Добавить тип ошибки:

```ts
export class CursorApiError extends Error {
  status: number;
  code?: string;
  body: string;
}
```

Если Cursor вернул JSON error — извлечь `code/message`, но raw body сохранить всегда.

Backend решает, какое пользовательское сообщение показать.

---

# 13. `src/cursorClient/sse.ts`

SSE parser вынести отдельно от HTTP client.

Он не должен знать ничего о Pulsar.

Экспортировать примерно:

```ts
export async function* readCursorSse(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<CursorSseEnvelope>
```

Envelope:

```ts
type CursorSseEnvelope = {
  id?: string;
  event?: string;
  data: string;
};
```

Отдельно:

```ts
parseCursorStreamEvent(envelope)
```

---

# 14. SSE parser обязан корректно работать с network chunks

Нельзя считать:

```text
1 reader.read() == 1 SSE event
```

Нужен buffer.

Нормализовать:

```text
\r\n -> \n
```

Событие заканчивается на:

```text
\n\n
```

Поддерживать поля:

```text
id:
event:
data:
```

Несколько `data:` объединять через `\n`.

Запоминать последний event id.

---

# 15. SSE reconnect

Cursor stream поддерживает `Last-Event-ID`.

Алгоритм:

```text
open stream
read events
remember last id

normal done:
    finish

AbortSignal:
    finish without reconnect

network failure:
    reconnect with Last-Event-ID

410 stream_expired:
    stop reconnecting
    backend falls back to GET run
```

Fallback:

```http
GET /v1/agents/{agentId}/runs/{runId}
```

---

# 16. `src/cursorClient/repository.ts`

Этот модуль связывает локальный Pulsar project с repository, доступным Cursor.

Основные функции:

```ts
getOriginUrl(projectRoot)
normalizeRepositoryUrl(url)
getCurrentBranch(projectRoot)
getCurrentCommit(projectRoot)
validateWorkingTree(projectRoot)
getRemoteBranchSha(projectRoot, branch)
resolveCursorRepository(...)
```

Модуль не создаёт Cloud Agent.

---

# 17. Нормализация repository URL

Минимально поддержать:

```text
git@github.com:Owner/Repo.git
ssh://git@github.com/Owner/Repo.git
https://github.com/Owner/Repo.git
https://github.com/Owner/Repo/
```

Canonical form:

```text
https://github.com/Owner/Repo
```

Для comparison key lowercase hostname.

Path без необходимости не переписывать для отображения.

---

# 18. Проверка repository access

`resolveCursorRepository()` получает:

```text
projectRoot
CursorClient
RepositoryCache
```

Алгоритм:

```text
origin = getOriginUrl(projectRoot)
normalizedOrigin = normalize(origin)

availableRepos = cached listRepositories()

match = find normalized equality

if no match:
    throw readable error

return Cursor-provided repository URL
```

---

# 19. Проверка local git state

Перед первым remote create:

## 19.1. Working tree

```bash
git status --porcelain
```

Непустой output -> block.

## 19.2. Branch

```bash
git rev-parse --abbrev-ref HEAD
```

Если результат `HEAD`, значит detached HEAD.

В первой версии -> block.

Не усложнять первую реализацию запуском от raw SHA.

## 19.3. Remote branch

```bash
git ls-remote --exit-code --heads origin <branch>
```

Если ветки нет -> block.

## 19.4. Revision equality

```bash
git rev-parse HEAD
```

сравнить с SHA из:

```bash
git ls-remote origin refs/heads/<branch>
```

SHA должны совпадать.

---

# 20. Не использовать `src/git-command.ts`

`src/git-command.ts` относится к tool policy builtin agent.

Cursor repository checks — внутренняя инфраструктура backend.

Использовать `spawn` с фиксированными аргументами.

Не собирать shell-string из пользовательского ввода.

Если `repository.ts` станет слишком большим, допустимо добавить:

```text
src/cursorClient/git.ts
```

Но весь этот код остаётся внутри `cursorClient`.

---

# 21. Создать `CursorBackend`

Файл:

```text
src/session/backends/cursor-backend.ts
```

Класс:

```ts
export class CursorBackend implements AgentBackend
```

Он отвечает за:

- lifecycle `AgentBackend`;
- локальные Cursor sessions;
- mapping Pulsar session -> Cursor agent;
- mapping prompt -> Cursor run;
- persistence;
- перевод Cursor SSE -> существующие `SessionUpdate`/`AgentEvent`.

Он не должен вручную строить HTTP URLs — только использовать `CursorClient`.

---

# 22. Cursor session state

В backend держать примерно:

```ts
type CursorSessionState = {
  sessionId: string;
  cwd: string;

  remoteCreated: boolean;

  repositoryUrl?: string;
  startingRef?: string;
  latestRunId?: string;

  title: string;
  createdAt: number;
  messages: StoredContextMessage[];

  pending: AbortController | null;
};
```

`sessionId` одновременно использовать как Cursor `agentId`.

---

# 23. Client-generated Cursor agent ID

Cursor позволяет передать:

```json
{
  "agentId": "bc-<uuid>"
}
```

Использовать это.

`newSession()` генерирует `bc-UUID`, но не делает HTTP request.

```text
sessionId      = bc-...
remoteCreated  = false
```

Это хорошо ложится на существующий `AgentSession`, который ожидает session ID до первого prompt.

---

# 24. `start(cwd)`

Алгоритм:

```text
создать CursorClient
загрузить локальные stored sessions

если есть последняя подходящая session:
    loadSession()
иначе:
    newSession(cwd)

emit initialized
return BackendInitResult
```

В `start()` не делать:

```http
POST /v1/agents
```

И не вызывать `/v1/repositories`, чтобы простое открытие панели не зависело от долгого API call.

Repository validation выполняется перед первым remote create.

---

# 25. Первый `prompt()`

Если:

```text
remoteCreated === false
```

алгоритм:

```text
1. ContentBlock[] -> prompt text
2. validate clean working tree
3. determine current branch
4. compare local HEAD with remote branch SHA
5. determine origin
6. validate origin through Cursor /v1/repositories
7. POST /v1/agents
8. save returned initial run ID
9. remoteCreated = true
10. stream initial run
11. persist session
```

Create request:

```json
{
  "agentId": "bc-...",
  "prompt": {
    "text": "..."
  },
  "model": {
    "id": "composer-2"
  },
  "repos": [
    {
      "url": "https://github.com/owner/repository",
      "startingRef": "feature/foo"
    }
  ],
  "mode": "agent",
  "autoCreatePR": false,
  "workOnCurrentBranch": false
}
```

`startingRef` здесь — текущая локальная ветка, уже проверенная как существующая на remote и совпадающая по SHA.

---

# 26. Follow-up `prompt()`

Если:

```text
remoteCreated === true
```

не создавать новый agent.

Вызывать:

```http
POST /v1/agents/{agentId}/runs
```

с новым prompt.

После ответа:

```text
latestRunId = run.id
streamRun(agentId, runId)
persist
```

Cursor Agent — durable conversation.

Run — отдельный turn.

---

# 27. `ContentBlock[] -> Cursor prompt`

`AgentSession.prompt()` уже передаёт backend'у `acp.ContentBlock[]`.

Не копировать конвертацию в двух местах.

Вынести существующую логику builtin agent в общий helper, например:

```text
src/session/prompt-text.ts
```

Функция:

```ts
contentBlocksToText(blocks)
```

Правила:

```text
text -> обычный text
resource/text -> <file uri="...">...</file>
```

Блоки разделять `\n\n`.

Этот helper общий, поэтому он не относится к `cursorClient`.

На первом этапе:

```ts
CursorBackend.supportsImages() === false
```

---

# 28. Cursor SSE -> существующий UI protocol

Не создавать Cursor-specific event model для View.

Backend переводит Cursor stream в уже существующие ACP-подобные updates.

## `assistant`

```ts
{
  sessionUpdate: "agent_message_chunk",
  messageId,
  content: {
    type: "text",
    text: delta,
  },
}
```

## `thinking`

```ts
{
  sessionUpdate: "agent_thought_chunk",
  messageId,
  content: {
    type: "text",
    text: delta,
  },
}
```

## `tool_call`

Первое событие:

```ts
{
  sessionUpdate: "tool_call",
  toolCallId,
  title,
  kind: "other",
  status: "in_progress",
  rawInput,
}
```

Обновление:

```ts
{
  sessionUpdate: "tool_call_update",
  toolCallId,
  status,
  rawOutput,
}
```

На первом этапе не пытаться умно классифицировать Cursor tools.

---

# 29. Не эмитить `file-written`

Cursor меняет файлы в Cloud VM/remote branch.

`CursorBackend` не должен делать:

```ts
emit({ type: "file-written", ... })
```

Иначе локальный Pulsar будет считать изменёнными файлы, которых Cursor локально не касался.

---

# 30. Final result и недопущение дублей

Во время SSE:

```ts
let streamedAssistantText = "";
```

Каждый assistant delta:

```text
append to streamedAssistantText
emit to UI
```

На `result`:

```text
если streamedAssistantText непустой:
    result.text не emit повторно
    использовать его как canonical persisted final text

если streamedAssistantText пустой:
    emit result.text
```

---

# 31. Fallback после потерянного SSE

Если stream потерян и reconnect невозможен:

```http
GET /v1/agents/{agentId}/runs/{runId}
```

Если run terminal — использовать REST result.

Если run ещё выполняется — снова открывать stream по правилам retry/reconnect.

---

# 32. `cancel()`

В backend держать:

```ts
private pending: AbortController | null;
private activeRunId: string | null;
```

При cancel:

```text
1. abort local SSE fetch
2. если remoteCreated && activeRunId:
       cancel remote run
3. после terminal state очистить activeRunId
```

`409 run_not_cancellable` после Stop считать benign race: run мог закончиться раньше cancel request.

---

# 33. Persistence

Использовать существующий `session-storage.ts`.

Расширить `StoredSession` optional-полем:

```ts
providerState?: Record<string, unknown>;
```

Storage version менять не нужно только ради optional-поля.

Cursor provider state:

```json
{
  "kind": "cursor",
  "remoteCreated": true,
  "repositoryUrl": "https://github.com/owner/repository",
  "startingRef": "feature/foo",
  "latestRunId": "run-..."
}
```

Messages продолжают храниться в `StoredContextMessage[]`.

---

# 34. Local transcript не является Cursor context

После создания Cloud Agent контекст conversation хранит Cursor.

Локальный transcript нужен для:

- UI history;
- восстановления панели;
- session list;
- локального UX.

При follow-up нельзя повторно отправлять весь локальный transcript.

В `/runs` уходит только новый prompt.

---

# 35. `loadSession()`

Алгоритм:

```text
1. load StoredSession
2. restore CursorSessionState
3. replay local transcript into Pulsar UI
4. если remoteCreated:
       GET /v1/agents/{sessionId}
5. inspect remote status
```

Если agent `IDLE`/`ACTIVE` — session usable.

Если `ARCHIVED` — историю показывать, но не unarchive сразу.

Unarchive делать только при следующем Send.

Если agent 404:

- историю оставить;
- follow-up запретить;
- показать:

```text
This Cursor Cloud Agent no longer exists.
Start a new session to continue.
```

---

# 36. `newSession()`

```text
new bc-UUID
remoteCreated = false
repositoryUrl = undefined
startingRef = undefined
latestRunId = undefined
messages = []
persist
```

Никакого remote request.

---

# 37. `deleteSession()`

Не делать permanent delete Cursor agent.

Поведение:

```text
если remoteCreated:
    archiveAgent(sessionId)

deleteStoredSession(...)
remove runtime state
```

Если archive вернул 404 — всё равно удалить local session.

Если archive упал по network/5xx — local session не удалять, чтобы операция была повторяемой и пользователь не потерял связь с remote agent случайно.

---

# 38. Archived session + новый prompt

Если loaded session remote status `ARCHIVED` и пользователь отправляет новый prompt:

```text
unarchive agent
create new run
```

Если unarchive не удался — prompt не отправлять.

---

# 39. `AgentSession` routing

Убрать бинарную схему:

```text
openai -> BuiltinBackend
else   -> AcpCliBackend
```

Сделать явный exhaustive `switch`:

```ts
switch (target.kind) {
  case "openai":
    this.backend = new BuiltinBackend(...);
    break;

  case "cursor":
    this.backend = new CursorBackend(...);
    break;

  case "acp":
    this.backend = new AcpCliBackend(...);
    break;
}
```

Никакого fallback `else`.

---

# 40. Backend export

В:

```text
src/session/backends/index.ts
```

добавить:

```ts
export * from "./cursor-backend";
```

---

# 41. Cursor models

Получать через:

```http
GET /v1/models
```

Не использовать `fetchOpenAiModels()`.

В `CursorClient`:

```ts
listModels(): Promise<CursorModel[]>
```

Cursor response использует `items`, а не OpenAI `data`.

---

# 42. Provider-neutral UI model type

UI не должен зависеть от `OpenAiModelInfo`.

Вынести простой тип, например:

```text
src/view/model-info.ts
```

```ts
export type ModelInfo = {
  id: string;
  description?: string;
};
```

OpenAI и Cursor конвертируют свои transport types в этот UI type.

---

# 43. Model selector

Показывать для:

```text
openai
cursor
```

Не показывать для:

```text
acp
```

Но поведение смены модели различается.

---

# 44. Cursor model фиксируется после remote create

До первого prompt:

```text
remoteCreated == false
model selector enabled
```

После создания Cursor agent:

```text
remoteCreated == true
model selector disabled
```

Tooltip:

```text
Cursor model is fixed for this session.
Create a new session to use another model.
```

Не менять только локальный dropdown, если remote agent уже создан.

---

# 45. Capability `canSetModel()`

Добавить в `AgentBackend`:

```ts
canSetModel(): boolean;
```

Реализации:

```text
BuiltinBackend  -> true
AcpCliBackend   -> false
CursorBackend   -> !remoteCreated
```

`AgentSession` проксирует capability.

UI использует capability вместо hardcoded `kind === "openai"` для enable/disable model selector.

---

# 46. `setModel()` Cursor

```text
если remoteCreated:
    throw error
иначе:
    update target.model
```

Модель попадёт в будущий `POST /v1/agents`.

---

# 47. Context progress bar

Для Cursor **не показывать** существующий OpenAI context progress.

Причина: remote Cursor conversation context нельзя корректно вычислить из локального `StoredContextMessage[]`.

Оставить bar только для OpenAI builtin backend.

---

# 48. Compact context

Cursor backend не поддерживает существующий local compact.

Локальное сокращение transcript не уменьшит контекст Cursor Cloud Agent.

В `AgentSession` добавить простой capability:

```ts
canCompactContext(): boolean {
  return typeof this.backend?.compactContext === "function";
}
```

Кнопку Compact показывать только если capability true.

Для Cursor — false.

---

# 49. Session list

`CursorBackend.canListSessions()` возвращает `true`.

Список строить из локального `session-storage`, а не через Cursor `List Agents`.

Причины:

- Pulsar panel должен показывать sessions текущего project;
- не нужно листать весь Cursor account;
- меньше API traffic;
- локальное storage уже используется остальными backend'ами.

---

# 50. `listSessions()`

Использовать:

```ts
listStoredSessions(storageDir)
```

Если необходимо отличать provider, использовать `providerState.kind === "cursor"`.

Не строить project session list по удалённому Cursor API.

---

# 51. Граница зависимостей

`cursorClient` не импортирует ACP SDK/application types.

Правильная зависимость:

```text
cursorClient
    |
    | Cursor API types
    v
CursorBackend
    |
    | converts to AgentBackend/ACP-like events
    v
AgentSession / View
```

Не наоборот.

---

# 52. Remote branch / PR после run

Если terminal result содержит branch/PR — показать через `status-note`.

Например:

```text
Cursor branch: cursor/fix-auth
PR: https://github.com/owner/repo/pull/123
```

Не делать автоматически:

- `git fetch`;
- checkout;
- pull;
- merge.

---

# 53. Не притворяться, что локальные файлы изменены

UI wording не должен говорить:

```text
Files updated locally
Changes applied
```

Корректный смысл:

```text
Cursor completed work on remote branch ...
```

Локальная синхронизация — отдельная будущая задача.

---

# 54. Error handling

Минимальный mapping.

## 401

```text
Cursor API key is invalid.
```

## 403

```text
Cursor API access denied.
```

Если response позволяет определить repository permission problem — показать более конкретное сообщение.

## Repository отсутствует в `/v1/repositories`

```text
Cursor does not have access to this project's repository.
```

## Dirty working tree

```text
Cursor cannot see local uncommitted changes.
Commit and push them first.
```

## Local/remote SHA mismatch

```text
The local branch does not match the remote branch.
Push or update the branch before starting Cursor.
```

## 404 agent

```text
Cursor Cloud Agent no longer exists.
Start a new session.
```

## 409 agent_busy

```text
Cursor Agent is already running another turn.
```

## 409 run_not_cancellable

После Stop считать benign race.

## 410 stream_expired

Fallback на `GET run`.

## 429

Учитывать `Retry-After`.

GET/SSE можно retry с backoff.

POST нельзя повторять вслепую.

---

# 55. Idempotency первого create

На первом prompt использовать client-generated `agentId == sessionId`.

Если `POST /v1/agents` дошёл до Cursor, но response потерялся, повтор может вернуть:

```text
409 agent_id_conflict
```

Это не повод создавать новый ID.

Recovery:

```text
POST create
    |
    +-- success -> normal flow
    |
    +-- 409 agent_id_conflict
            |
            v
        GET /v1/agents/{sessionId}
            |
            v
        get latestRunId
            |
            v
        GET/stream run
```

---

# 56. Не retry `createRun()` вслепую

Если connection оборвался после:

```http
POST /v1/agents/{id}/runs
```

неизвестно, был ли run создан.

Повтор POST может выполнить prompt дважды.

Recovery:

```text
remember previous latestRunId
POST run fails ambiguously
GET agent
compare latestRunId

если latestRunId изменился:
    новый run был создан
    продолжить его

если не изменился:
    решать вопрос повторного POST
```

Эту логику держать в одном месте.

---

# 57. Тестовая стратегия

Тесты разделить по слоям.

---

# 58. `test/agent-config.test.mjs`

Удалить:

- `resolveApiKey` tests;
- `apiKeyEnv` fixtures;
- env fallback tests.

Добавить:

```text
cursor config normalizes correctly
cursor requires direct apiKey
cursor requires baseUrl/defaultModel
cursor defaults mode=agent
cursor defaults autoCreatePR=false
cursor defaults workOnCurrentBranch=false
cursor LaunchTarget
launchTargetsEqual cursor
groupAgents order openai -> cursor -> acp
```

---

# 59. `test/cursor-client.test.mjs`

Новый файл.

Проверить:

```text
Bearer Authorization
baseUrl trimming
GET /models
GET /repositories
POST /agents
GET /agents/:id
POST /agents/:id/runs
GET run
cancel
archive
unarchive
AbortSignal
JSON error
non-JSON error
```

---

# 60. SSE tests

Обязательно проверять порезанные network chunks.

Например:

```text
chunk 1:
eve

chunk 2:
nt: assistant
id: 1
da

chunk 3:
ta: {"text":"hello"}

```

Парсер обязан вернуть одно корректное событие.

Также проверить:

```text
multiple events per chunk
multiple data lines
CRLF
Last-Event-ID
network reconnect
410 stream expired
abort during read
```

---

# 61. `test/cursor-repository.test.mjs`

Новый файл.

URL normalization:

```text
git@github.com:a/b.git
https://github.com/a/b.git
https://github.com/a/b/
ssh://git@github.com/a/b.git
```

Repository scenarios:

```text
no origin
repo absent from Cursor list
repo present in Cursor list
repository cache hit
repository cache expiry
```

Git-state scenarios:

```text
dirty working tree
detached HEAD
remote branch absent
local SHA == remote SHA
local SHA != remote SHA
```

Git execution лучше завернуть в injectable runner, чтобы unit tests не зависели от настоящего GitHub/network.

---

# 62. `test/cursor-backend.test.mjs`

Новый файл.

Mock `CursorClient`.

Проверить:

```text
start creates local session only
start does not POST create agent

first prompt validates repository
first prompt creates Cursor agent
first prompt streams run
first prompt persists state

second prompt reuses same Cursor agent
second prompt creates new run

assistant -> agent_message_chunk
thinking -> agent_thought_chunk
tool call -> tool_call/tool_call_update
result does not duplicate streamed text

cancel aborts stream
cancel calls remote cancel

load replays transcript
missing remote agent keeps history read-only
archived agent unarchives before follow-up

delete archives remote agent
delete removes local stored session after successful archive

newSession creates new bc-id
```

---

# 63. Инвариант: Cursor backend не меняет local editor files

Нужен тест, который гарантирует, что Cursor backend не вызывает:

```text
editor.writeTextFile()
editor.moveTextFile()
fileTreeManager.notifyPathModified()
```

Cursor работает удалённо.

---

# 64. Build/test порядок

После каждого крупного этапа:

```bash
npm run typecheck
npm run build
npm test
```

Существующие tests импортируют собранный `lib/*.js`, поэтому build обязателен перед тестами после изменения `src/`.

---

# 65. Рекомендуемый порядок реализации

## Этап A — удалить legacy `apiKeyEnv`

1. удалить `apiKeyEnv`;
2. удалить `resolveApiKey`;
3. убрать `process.env` из `toLaunchTarget`;
4. поправить tests;
5. `typecheck/build/test`.

Никаких миграций.

## Этап B — provider-specific config types

1. сделать discriminated union;
2. добавить `CursorAgentConfig`;
3. добавить `CursorLaunchTarget`;
4. добавить Cursor group;
5. tests;
6. `typecheck/build/test`.

## Этап C — `src/cursorClient/`

1. `types.ts`;
2. `client.ts`;
3. models;
4. repositories;
5. agents/runs;
6. `sse.ts`;
7. tests;
8. `typecheck/build/test`.

## Этап D — repository validation

1. origin resolver;
2. URL normalization;
3. `/v1/repositories` cache;
4. dirty check;
5. branch check;
6. remote SHA check;
7. tests;
8. `typecheck/build/test`.

## Этап E — `CursorBackend`

1. реализовать `AgentBackend` skeleton;
2. local `newSession`;
3. `start`;
4. persistence;
5. first prompt -> create agent;
6. follow-up -> create run;
7. cancel;
8. load;
9. delete/archive;
10. tests.

## Этап F — streaming adapter

1. assistant;
2. thinking;
3. tool calls;
4. result;
5. reconnect;
6. 410 fallback;
7. persistence;
8. tests.

## Этап G — `AgentSession` routing

1. import CursorBackend;
2. exhaustive `switch` по `target.kind`;
3. export backend;
4. build/test.

## Этап H — model UI

1. provider-neutral `ModelInfo`;
2. Cursor model loader;
3. Cursor model selector;
4. `canSetModel()`;
5. lock model after remote create;
6. context bar оставить OpenAI-only;
7. build/test.

## Этап I — UX cleanup

1. hide Compact for Cursor;
2. Cursor group label;
3. branch/PR status note;
4. readable errors;
5. проверить Restart/New Session/Stop.

---

# 66. Новые файлы

```text
src/cursorClient/
  client.ts
  types.ts
  sse.ts
  repository.ts
  index.ts

src/session/backends/
  cursor-backend.ts

test/
  cursor-client.test.mjs
  cursor-repository.test.mjs
  cursor-backend.test.mjs
```

Возможные небольшие общие helpers:

```text
src/session/prompt-text.ts
src/view/model-info.ts
```

---

# 67. Существующие файлы, которые нужно изменить

```text
src/agent-config.ts
src/session/backends/backend.ts
src/session/backends/index.ts
src/session/agent-session.ts
src/session-storage.ts
src/view/agent-view.ts
src/view/model-selector.ts
test/agent-config.test.mjs
```

---

# 68. Что сознательно НЕ входит в эту задачу

Не реализовывать сейчас:

```text
README/documentation changes
apiKeyEnv migration
automatic git commit
automatic git push
temporary remote branches
automatic checkout Cursor branch
automatic pull/merge Cursor result
local application of Cursor diff
Cursor image attachments
Cursor MCP configuration
Cursor envVars
multi-repository agents
named Cursor cloud environments
worker pools
self-hosted Cursor workers
advanced model params
permanent remote agent deletion
```

---

# 69. Definition of Done

Задача завершена только если выполняется весь сценарий:

```text
1. В config.cson есть type: "cursor" и прямой apiKey.

2. Открывается локальный git project в Pulsar.

3. На первом prompt backend:
   - находит origin;
   - проверяет clean working tree;
   - определяет текущую ветку;
   - проверяет наличие ветки на remote;
   - проверяет local HEAD == remote branch SHA;
   - проверяет через Cursor /v1/repositories, что Cursor имеет доступ к repo.

4. Если любая проверка не проходит:
   Cursor agent НЕ создаётся,
   пользователь получает понятную ошибку.

5. Если всё валидно:
   POST /v1/agents создаёт agent с выбранной моделью.

6. Cursor assistant/thinking/tool events появляются в существующем Pulsar UI.

7. Второй prompt создаёт новый run в том же Cursor agent.

8. Stop отменяет текущий Cursor run.

9. New Session создаёт новый локальный bc-id и не создаёт remote agent до первого prompt.

10. Restart/load восстанавливает локальный transcript и продолжает существующий remote Cursor agent.

11. Delete Session архивирует remote Cursor agent и удаляет локальный session cache.

12. После remote create модель нельзя сменить внутри session.

13. Cursor remote tool calls не помечают локальные файлы Pulsar изменёнными.

14. Terminal result показывает remote branch/PR, но ничего автоматически не checkout/merge.

15. apiKeyEnv полностью отсутствует в исходниках и тестах.

16. Выполняются:

    npm run typecheck
    npm run build
    npm test
```

---

# 70. Проверенные Cursor API ограничения

На момент составления плана официальный Cursor Cloud Agents API предоставляет как минимум:

```text
POST /v1/agents
POST /v1/agents/{agentId}/runs
GET  /v1/agents/{agentId}/runs/{runId}
GET  /v1/agents/{agentId}/runs/{runId}/stream
cancel run
GET  /v1/models
GET  /v1/repositories
archive / unarchive agent
```

`POST /v1/agents` поддерживает:

```text
client-supplied agentId
repos[].url
repos[].startingRef
model.id
mode
autoCreatePR
workOnCurrentBranch
```

`GET /v1/repositories` возвращает репозитории, доступные пользователю через Cursor source-control integration, и имеет строгие rate limits.

Официальные источники для повторной сверки во время реализации:

```text
https://cursor.com/docs/cloud-agent/api/endpoints
https://cursor.com/docs/cloud-agent
```

Cloud Agents API активно развивается, поэтому перед реализацией конкретного request/response type в `src/cursorClient/types.ts` нужно повторно сверить актуальную официальную схему.
