# SGF — Módulo 5: Controle de Ponto e Jornada de Operários

Monorepo (npm workspaces) do sistema de ponto facial **Offline-First** para canteiros de obra.
Fontes de verdade do modelo: `docs/der-mer-modulo5.png` (DER) e
`docs/diagrama-sequencia-registro-ponto.png` (Diagrama de Sequência UML). Nomes de tabelas,
colunas e mensagens devem permanecer **idênticos** aos diagramas (ex.: `REGISTO_PONTO`, `id_registo`).

## Comandos (Windows / PowerShell, Node >= 22.5 — testado em Node 26)

| Comando | O que faz |
|---|---|
| `npm install` | Instala backend + frontend (workspaces) |
| `npm run dev` | Sobe API (http://127.0.0.1:3333) + Web (http://localhost:5173) com `concurrently` |
| `npm test` | Suíte V-Model completa (Vitest + Supertest, SGBD real em memória) |
| `npm run build` | `tsc` do backend + `tsc --noEmit` e `vite build` do frontend |
| `npm run db:reset` | Apaga `backend/data/sgf.db` e reaplica o seed (pare o `dev` antes) |
| `npm start` | API compilada (`backend/dist`) — rode `npm run build` antes |

Variáveis opcionais da API: `SGF_API_PORT` (3333), `SGF_API_HOST` (127.0.0.1), `SGF_DB_PATH`.
Não use `PORT`: launchers de preview exportam `PORT=5173` e a API colidiria com o Vite.

## Arquitetura

```
backend/src
  routes/        -> Controllers Fastify (participante "Interface" do lado servidor)
  services/      -> ServicoJornada.ts (Regra), ServicoCadastros.ts, ServicoAuditoria.ts,
                    regrasCLT.ts (funções puras), ReconhecimentoFacial.ts
  repositories/  -> PersistenciaSGBD.ts (único ponto que executa SQL)
  db/            -> schemaSqlite.ts (DDL+triggers+views), conexao.ts, seed.ts
frontend/src
  lib/           -> api.ts, dbLocal.ts (Dexie/IndexedDB), servicoCampo.ts (fila offline),
                    sincronizacao.ts, reconhecimentoFacial.ts, regrasCLT.ts, tempo.ts
  campo/         -> Modo Campo (App Mobile do Fiscal)
  escritorio/    -> Modo Escritório (Dashboard RH)
docs/schema.sql  -> mesmo modelo em SQL PostgreSQL (FK, CHECK, triggers plpgsql, views)
```

Fluxo crítico (Diagrama de Sequência — 4 participantes):
`Fiscal de Obra` → `Interface Mobile` (`servicoCampo.registarPonto`) →
`ServicoJornada.validarERegistarBatida` → `PersistenciaSGBD.consultarColaboradorEUltimaSaida` /
`inserirRegistoPonto`. Fragmento `alt`: rejeição **antes** do INSERT (404/422 com
`{ erro: "Matricula invalida ou violacao Interjornada < 11h", detalhes }`) ou INSERT +
`{ id_registo, status_imutavel: true, data_hora_batida, horas_acumuladas }`.

## Modelo 3FN (SGBD = SQLite via `node:sqlite`, `PRAGMA foreign_keys = ON`)

- Cadastros mestres: `OBRA`, `ESCALA_TURNO`, `COLABORADOR`.
- Ocorrência transacional: `REGISTO_PONTO` guarda **apenas FKs** + dados da batida. Nada de
  nome/função/obra duplicados, nada de colunas físicas de totais.
- `JUSTIFICATIVA_AJUSTE` 0:1 com `REGISTO_PONTO` (UNIQUE em `id_registo`).
- Derivados só em views: `vw_espelho_ponto_diario`, `vw_resumo_presenca_obra`.
- `data_hora_batida` é texto canônico `YYYY-MM-DD HH:MM:SS` no **horário local do canteiro**
  (CHECK no SQLite). Sempre o horário original da captura, inclusive após sync offline.
- Horas em DECIMAL(10,2) exato: segundos inteiros → minutos inteiros →
  centésimos `(min*100+30)/60` (inteiro). No SQLite a view expõe `horas_trabalhadas` como
  texto `H.CC` (+ `centesimos_trabalhados` INTEGER); no PostgreSQL é `DECIMAL(10,2)`.

## Regras CLT / Portaria

- **Art. 66 CLT (interjornada):** `ENTRADA` exige >= 660 min desde a última `SAIDA` anterior à
  batida. 10h59 bloqueia; 11h00 aprova (comparação em segundos).
- **Art. 58 §1º:** `tolerancia_clt_min` (0–10) define a faixa CONFORME no espelho.
- **Portaria MTP 671/2021:** triggers `BEFORE UPDATE/DELETE` em `REGISTO_PONTO` abortam com
  `Registro de ponto e imutavel conforme Portaria 671/2021`. Retificação = INSERT em
  `JUSTIFICATIVA_AJUSTE` (também append-only).
- Confiança facial mínima: **85.00**. `foto_hash` precisa conferir com `hash_template_facial`.

## Offline-First

- Conectividade efetiva = `navigator.onLine` && !Modo Avião (toggle) && `/api/health` alcançável.
  Falha de rede numa batida online cai automaticamente na fila local.
- Offline: valida matrícula/obra/biometria contra o cache Dexie, grava na fila (< 2 s) com
  `sincronizado_offline = true`, badge **Offline / Pendente**. Interjornada é só um aviso local;
  o servidor decide na sync.
- Sync: `POST /api/pontos/sync` em ordem cronológica, preserva o timestamp original;
  aceito → **Ponto Sincronizado**; rejeitado → **Conflito / Rejeitado** com motivo (nunca some).
  Reenvio idêntico (mesmo colaborador + data_hora + tipo) é idempotente (`duplicado: true`).

## Seed (idempotente, `backend/src/db/seed.ts`)

Obra 10 `OBRA-010` "Arena MRV - Setor A"; Escala 1 "Comercial Obra 08h-17h" (480/10);
Carlos Souza `1024` (última SAIDA há 15h) e Marcos Silva `2048` (última SAIDA há exatamente
10h59 — **o cenário de violação expira 1 min após o seed**; use `npm run db:reset` ou o campo
"Horário manual" no Modo Campo para demonstrar).

## Testes (V-Model) — `backend/tests`

1. `1-unidade` — regras CLT, decimal exato, ServicoJornada com repositório falso.
2. `2-integracao` — CT01: FK (matrícula 99999), triggers de imutabilidade, CHECKs, 0:1, views.
3. `3-sistema` — fila offline real do frontend (Dexie + fake-indexeddb) → API → SGBD → views.
4. `4-aceitacao` — CT02: batida de Carlos às 08:00 na obra 10, comprovante e presentes na view.

## Convenções

- Código e mensagens em português; mensagens de erro sem acento (fidelidade ao diagrama).
- Toda SQL fica em `PersistenciaSGBD.ts`; services não acessam o banco diretamente.
- Alterou o schema SQLite? Replique em `docs/schema.sql` (dialeto PostgreSQL).
- Não fazer `git push` automaticamente.
