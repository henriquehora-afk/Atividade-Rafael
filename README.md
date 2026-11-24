# SGF — Módulo 5: Controle de Ponto e Jornada de Operários

Sistema de ponto facial **Offline-First** para canteiros de obra, com modelo relacional em **3FN**,
regras da **CLT (Art. 66 — interjornada de 11h)** e imutabilidade das batidas conforme a
**Portaria MTP nº 671/2021**.

- **App do Fiscal (Modo Campo):** registra batidas por reconhecimento facial (câmera real via
  `getUserMedia` + captura simulada), funciona sem internet e sincroniza depois.
- **Dashboard do RH (Modo Escritório):** presença em tempo real, espelho de ponto, justificativas de
  ajuste e cadastros mestres.

**Stack:** Node.js + TypeScript + Fastify + SQLite (`node:sqlite`) · React + Vite + Tailwind CSS +
Dexie (IndexedDB) · Vitest + Supertest.

> O reconhecimento facial é **simulado** (a câmera é real, mas a identificação e a confiança são
> definidas pelo fiscal na tela), conforme o escopo da atividade.

---

## Roteiro de teste (avaliação)

### 0. Pré-requisitos

- **Node.js 22.5 ou superior** (testado no 26). Versões antigas não têm o banco embutido `node:sqlite`.
- **Git**, ou baixar o ZIP pelo botão *Code → Download ZIP* no GitHub.
- Navegador moderno (Chrome, Edge ou Firefox).

### 1. Baixar e instalar

```bash
git clone https://github.com/henriquehora-afk/Atividade-Rafael.git
cd Atividade-Rafael
npm install
```

O `npm install` pode exibir avisos sobre `install-scripts` do esbuild. Podem ser ignorados.

### 2. Rodar os testes automáticos (V-Model)

```bash
npm test
```

**Resultado esperado:** `Test Files 5 passed (5)` e `Tests 54 passed (54)`.

| Nível | O que é verificado |
|---|---|
| 1 · Unidade | Regra das 11h (10h59 bloqueia, 11h00 libera) e cálculo exato de horas em DECIMAL(10,2) |
| 2 · Integração (CT01) | Matrícula 99999 recusada (FOREIGN KEY) e triggers bloqueando UPDATE/DELETE de batidas |
| 3 · Sistema | Batida offline às 08:00 → fila local → sincronização → chega ao banco ainda como 08:00 |
| 4 · Aceitação (CT02) | Batida do Carlos às 08:00 na Arena MRV: comprovante emitido e presentes +1 no dashboard |

Opcional: `npm run build` confirma que não há erros de TypeScript.

### 3. Abrir o aplicativo

```bash
npm run dev
```

Abra **http://localhost:5173** no navegador. Na primeira execução o banco é criado e populado
automaticamente: obra 10 (*Arena MRV - Setor A*), escala 1 (*Comercial Obra 08h-17h*),
**Carlos Souza (1024)** e **Marcos Silva (2048)**.

### 4. Modo Campo (app do fiscal)

No painel **"Roteiro de demonstração"** (à direita, ou abaixo em janelas estreitas), para cada
cenário clique em **"Preparar cenário"** e depois em **"Simular Captura Facial e Registrar"**.

| # | Cenário | O que deve aparecer |
|---|---|---|
| 1 | CT02 · Batida válida (Carlos, entrada) | Cartão verde **"Ponto Sincronizado"** com nº do comprovante, obra, horário e `status_imutavel = true` |
| 2 | Violação Interjornada (Marcos) | Alerta vermelho **"Matricula invalida ou violacao Interjornada < 11h"** e intervalo de 10h59min. Nada é gravado |
| 3 | CT01 · Matrícula 99999 | Mesmo alerta, com "Matricula 99999 nao cadastrada" |
| 4 | Biometria 72,5% | "Reconhecimento facial reprovado" (mínimo 85,00) |
| 5 | Offline → Sincronização | O cenário liga o **Modo Avião**. A batida aparece como **"Offline / Pendente"** com o tempo de gravação em ms. **Desligue o Modo Avião** no topo: ela sincroniza sozinha e vira **"Ponto Sincronizado"** com o horário original da captura |
| 6 | Conflito na sincronização (Marcos offline) | Fica "Offline / Pendente" com um aviso. Ao desligar o Modo Avião, vira **"Conflito / Rejeitado"** com o motivo visível |

**Dica:** logo após o cenário 1, abra o Modo Escritório para ver **Colaboradores Presentes = 1**
(o cenário 5 registra a saída para o almoço do Carlos, e aí ele deixa de contar como presente).

O botão **"Ativar câmera"** usa a webcam real; o navegador pede permissão e a câmera funciona em
`localhost`.

### 5. Modo Escritório (dashboard do RH)

Clique em **"Modo Escritório"** no topo.

- **Indicadores** (Presentes, Batidas Hoje, Sincronizados Offline, Ajustes Auditados): calculados
  pelas views `vw_resumo_presenca_obra` e `vw_espelho_ponto_diario`.
- **Espelho de Ponto & Auditoria:** clique numa linha para ver as batidas do dia.
  - **"Testar imutabilidade"** tenta um UPDATE direto: deve aparecer que foi **bloqueado pelo SGBD
    (HTTP 409)**.
  - **"Registrar Justificativa de Ajuste"**: preencha o motivo (mínimo 10 caracteres) e o
    responsável. O KPI "Ajustes Auditados" sobe, a batida original não muda e o botão some
    (cardinalidade 0:1).
- **Cadastros Mestres:** cadastre obra, escala ou colaborador. Tentar **excluir o Carlos** é
  recusado pela integridade referencial, porque ele possui batidas.

Opcional: no navegador, F12 → visualização de dispositivo móvel para ver o layout mobile-first.

### 6. Recomeçar do zero

Pare o servidor com **Ctrl+C** e rode:

```bash
npm run db:reset
npm run dev
```

O histórico exibido no app fica salvo no navegador e não é apagado pelo reset. Para limpá-lo:
F12 → Application → Clear site data.

### Problemas comuns

- **Erro com `node:sqlite`:** a versão do Node é anterior à 22.5.
- **Faixa "API indisponível" no dashboard:** a API não subiu; verifique as linhas `[API]` no
  terminal (por exemplo, porta 3333 ocupada).
- **Cenário 2 usa "horário manual":** é proposital. A última saída do Marcos fica a exatamente
  10h59 do momento em que o banco foi criado; passado 1 minuto, o botão escolhe automaticamente um
  horário que ainda viola a regra.

---

## Estrutura do projeto

```
backend/
  src/routes/        Controllers Fastify (HTTP)
  src/services/      ServicoJornada (regra CLT), cadastros, auditoria, regras puras
  src/repositories/  PersistenciaSGBD (único ponto que executa SQL)
  src/db/            DDL SQLite, triggers, views e seed
  tests/             Suíte V-Model: 1-unidade, 2-integracao, 3-sistema, 4-aceitacao
frontend/
  src/campo/         Modo Campo (app do fiscal)
  src/escritorio/    Modo Escritório (dashboard RH)
  src/lib/           Fila offline (Dexie), sincronização, API, reconhecimento facial simulado
docs/
  schema.sql         Mesmo modelo em PostgreSQL (FK, CHECK, triggers e views)
  *.png              DER e diagrama de sequência de referência
```

| Comando | O que faz |
|---|---|
| `npm install` | Instala backend e frontend (npm workspaces) |
| `npm run dev` | Sobe API (127.0.0.1:3333) e Web (localhost:5173) juntos |
| `npm test` | Roda a suíte completa do V-Model |
| `npm run build` | Compila backend e frontend |
| `npm run db:reset` | Recria o banco de demonstração (com o servidor parado) |
