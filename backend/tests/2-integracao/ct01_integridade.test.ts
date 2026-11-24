/**
 * CT01 — Integridade referencial e imutabilidade, executado contra o SGBD REAL
 * (SQLite em memória com o mesmo DDL/triggers/views da produção) e a API via Supertest.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MENSAGEM_IMUTABILIDADE, MENSAGEM_JUSTIFICATIVA_IMUTAVEL } from '../../src/db/schemaSqlite.js';
import { executarSeed } from '../../src/db/seed.js';
import { MSG_MATRICULA_OU_INTERJORNADA } from '../../src/services/erros.js';
import { batidaCarlos, contar, criarAmbiente, diaRelativo, hojeAs, hojeAsOitoHoras, idColaborador } from '../ambiente.js';

type Ambiente = Awaited<ReturnType<typeof criarAmbiente>>;

describe('[V-Model 2 · Integração] CT01 — Integridade referencial (FOREIGN KEY)', () => {
  let amb: Ambiente;
  beforeEach(async () => {
    amb = await criarAmbiente();
  });
  afterEach(async () => amb.fechar());

  it('SGBD inicia com PRAGMA foreign_keys = ON', () => {
    expect(amb.db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });

  it('API: batida com matricula 99999 (inexistente) na obra 10 → 404 e NENHUM INSERT em REGISTO_PONTO', async () => {
    const antes = contar(amb.db, 'REGISTO_PONTO');
    const r = await request(amb.app.server)
      .post('/api/pontos')
      .send({ ...batidaCarlos(hojeAs('08:00')), matricula: '99999', foto_hash: 'hash_facial_desconhecido_99999' });

    expect(r.status).toBe(404);
    expect(r.body.erro).toBe(MSG_MATRICULA_OU_INTERJORNADA);
    expect(r.body.detalhes).toContain('99999');
    expect(contar(amb.db, 'REGISTO_PONTO')).toBe(antes);
  });

  it('API: batida em obra inexistente → 404 e nenhum INSERT', async () => {
    const antes = contar(amb.db, 'REGISTO_PONTO');
    const r = await request(amb.app.server).post('/api/pontos').send(batidaCarlos(hojeAs('08:00'), 'ENTRADA', { id_obra: 999 }));
    expect(r.status).toBe(404);
    expect(r.body.codigo).toBe('OBRA_INEXISTENTE');
    expect(contar(amb.db, 'REGISTO_PONTO')).toBe(antes);
  });

  it('SGBD: INSERT direto com id_colaborador inexistente (99999) e id_obra = 10 viola FOREIGN KEY', () => {
    expect(() =>
      amb.db
        .prepare(
          `INSERT INTO REGISTO_PONTO (id_colaborador, id_obra, data_hora_batida, tipo_batida, confianca_facial, sincronizado_offline)
           VALUES (99999, 10, ?, 'ENTRADA', 97.00, 0)`,
        )
        .run(hojeAs('08:00')),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('SGBD: INSERT direto com id_obra inexistente viola FOREIGN KEY', () => {
    const id = idColaborador(amb.db, '1024');
    expect(() =>
      amb.db
        .prepare(
          `INSERT INTO REGISTO_PONTO (id_colaborador, id_obra, data_hora_batida, tipo_batida, confianca_facial)
           VALUES (?, 999, ?, 'ENTRADA', 97.00)`,
        )
        .run(id, hojeAs('08:00')),
    ).toThrow(/FOREIGN KEY constraint failed/);
  });

  it('ON DELETE RESTRICT: excluir obra/colaborador com batidas → 409 (histórico preservado)', async () => {
    const obra = await request(amb.app.server).delete('/api/obras/10');
    expect(obra.status).toBe(409);
    expect(obra.body.codigo).toBe('INTEGRIDADE_REFERENCIAL');

    const colab = await request(amb.app.server).delete(`/api/colaboradores/${idColaborador(amb.db, '1024')}`);
    expect(colab.status).toBe(409);
    expect(contar(amb.db, 'OBRA')).toBe(1);
    expect(contar(amb.db, 'COLABORADOR')).toBe(2);
  });

  it('CHECKs do SGBD: tipo_batida fora do domínio, confiança > 100 e timestamp não canônico são rejeitados', () => {
    const id = idColaborador(amb.db, '1024');
    const inserir = (tipo: string, conf: number, dataHora: string) => () =>
      amb.db
        .prepare(
          `INSERT INTO REGISTO_PONTO (id_colaborador, id_obra, data_hora_batida, tipo_batida, confianca_facial) VALUES (?, 10, ?, ?, ?)`,
        )
        .run(id, dataHora, tipo, conf);
    expect(inserir('INTERVALO', 97, hojeAs('08:00'))).toThrow(/CHECK constraint failed/);
    expect(inserir('ENTRADA', 100.01, hojeAs('08:00'))).toThrow(/CHECK constraint failed/);
    expect(inserir('ENTRADA', 97, '24/11/2026 08:00')).toThrow(/CHECK constraint failed/);
  });
});

describe('[V-Model 2 · Integração] CT01 — Imutabilidade (Portaria MTP 671/2021)', () => {
  let amb: Ambiente;
  beforeEach(async () => {
    amb = await criarAmbiente();
  });
  afterEach(async () => amb.fechar());

  it('UPDATE direto em REGISTO_PONTO é abortado pelo trigger BEFORE UPDATE', () => {
    const original = amb.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = 1').get();
    expect(() => amb.db.exec(`UPDATE REGISTO_PONTO SET data_hora_batida = '2000-01-01 00:00:00' WHERE id_registo = 1`)).toThrow(
      MENSAGEM_IMUTABILIDADE,
    );
    expect(() => amb.db.exec(`UPDATE REGISTO_PONTO SET confianca_facial = 100`)).toThrow(MENSAGEM_IMUTABILIDADE);
    expect(amb.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = 1').get()).toEqual(original);
  });

  it('DELETE direto (inclusive sem WHERE) é abortado pelo trigger BEFORE DELETE', () => {
    const antes = contar(amb.db, 'REGISTO_PONTO');
    expect(() => amb.db.exec('DELETE FROM REGISTO_PONTO WHERE id_registo = 1')).toThrow(MENSAGEM_IMUTABILIDADE);
    expect(() => amb.db.exec('DELETE FROM REGISTO_PONTO')).toThrow(MENSAGEM_IMUTABILIDADE);
    expect(contar(amb.db, 'REGISTO_PONTO')).toBe(antes);
  });

  it('API: PUT e DELETE em /api/pontos/:id recebem 409 com a mensagem do trigger', async () => {
    const put = await request(amb.app.server).put('/api/pontos/1').send({ data_hora_batida: '2000-01-01 00:00:00' });
    expect(put.status).toBe(409);
    expect(put.body.erro).toBe(MENSAGEM_IMUTABILIDADE);
    const del = await request(amb.app.server).delete('/api/pontos/1');
    expect(del.status).toBe(409);
    expect(del.body.codigo).toBe('REGISTRO_IMUTAVEL');
  });

  it('Retificação 0:1: JUSTIFICATIVA_AJUSTE é inserida sem alterar a batida; segunda justificativa → 409', async () => {
    const batidaAntes = amb.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = 1').get();
    const corpo = { id_registo: 1, motivo_ajuste: 'Saida registrada pelo encarregado apos falha da camera.', responsavel_rh: 'Ana RH' };

    const primeira = await request(amb.app.server).post('/api/justificativas').send(corpo);
    expect(primeira.status).toBe(201);
    expect(primeira.body).toMatchObject({ id_registo: 1, responsavel_rh: 'Ana RH' });

    const segunda = await request(amb.app.server).post('/api/justificativas').send(corpo);
    expect(segunda.status).toBe(409);
    expect(segunda.body.codigo).toBe('JUSTIFICATIVA_DUPLICADA');

    // UNIQUE(id_registo) também é garantido pelo próprio SGBD
    expect(() =>
      amb.db
        .prepare('INSERT INTO JUSTIFICATIVA_AJUSTE (id_registo, motivo_ajuste, responsavel_rh) VALUES (1, ?, ?)')
        .run('Tentativa direta duplicada', 'X'),
    ).toThrow(/UNIQUE constraint failed/);

    expect(amb.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = 1').get()).toEqual(batidaAntes);
    expect(contar(amb.db, 'JUSTIFICATIVA_AJUSTE')).toBe(1);
  });

  it('A trilha de auditoria também é append-only (UPDATE/DELETE em JUSTIFICATIVA_AJUSTE bloqueados)', async () => {
    await request(amb.app.server)
      .post('/api/justificativas')
      .send({ id_registo: 1, motivo_ajuste: 'Ajuste de teste de auditoria.', responsavel_rh: 'Ana RH' });
    expect(() => amb.db.exec(`UPDATE JUSTIFICATIVA_AJUSTE SET motivo_ajuste = 'adulterado'`)).toThrow(MENSAGEM_JUSTIFICATIVA_IMUTAVEL);
    expect(() => amb.db.exec('DELETE FROM JUSTIFICATIVA_AJUSTE')).toThrow(MENSAGEM_JUSTIFICATIVA_IMUTAVEL);
  });

  it('Justificativa para registo inexistente → 404 (FK)', async () => {
    const r = await request(amb.app.server)
      .post('/api/justificativas')
      .send({ id_registo: 9999, motivo_ajuste: 'Registro que nao existe.', responsavel_rh: 'Ana RH' });
    expect(r.status).toBe(404);
  });
});

describe('[V-Model 2 · Integração] Views SQL e seed', () => {
  let amb: Ambiente;
  beforeEach(async () => {
    amb = await criarAmbiente();
  });
  afterEach(async () => amb.fechar());

  it('vw_espelho_ponto_diario: 487 min → "8.12" h exatas, saldo +7 (CONFORME na tolerância de 10) e ajuste indicado', async () => {
    const dia = diaRelativo(-30);
    const ids: number[] = [];
    for (const [hora, tipo] of [
      ['08:00', 'ENTRADA'],
      ['12:00', 'SAIDA_ALMOCO'],
      ['13:00', 'VOLTA_ALMOCO'],
      ['17:07', 'SAIDA'],
    ] as const) {
      const r = await request(amb.app.server).post('/api/pontos').send(batidaCarlos(`${dia} ${hora}:00`, tipo));
      expect(r.status).toBe(201);
      ids.push(r.body.id_registo);
    }
    await request(amb.app.server)
      .post('/api/justificativas')
      .send({ id_registo: ids[3], motivo_ajuste: 'Saida apos o horario autorizada pelo engenheiro.', responsavel_rh: 'Ana RH' });

    const linha = amb.db
      .prepare('SELECT * FROM vw_espelho_ponto_diario WHERE id_colaborador = ? AND data_jornada = ?')
      .get(idColaborador(amb.db, '1024'), dia);
    expect(linha).toMatchObject({
      total_batidas: 4,
      minutos_trabalhados: 487,
      centesimos_trabalhados: 812,
      horas_trabalhadas: '8.12',
      carga_horaria_diaria_min: 480,
      carga_horaria_horas: '8.00',
      saldo_minutos: 7,
      situacao_jornada: 'CONFORME',
      possui_ajuste: 1,
      qtd_ajustes: 1,
    });
  });

  it('vw_espelho_ponto_diario: intervalos de 6 + 12 min somam "0.30" (sem 0.30000000000000004) e acusam DEBITO', async () => {
    const dia = diaRelativo(-20);
    for (const [hora, tipo] of [
      ['08:00', 'ENTRADA'],
      ['08:06', 'SAIDA_ALMOCO'],
      ['08:10', 'VOLTA_ALMOCO'],
      ['08:22', 'SAIDA'],
    ] as const) {
      expect((await request(amb.app.server).post('/api/pontos').send(batidaCarlos(`${dia} ${hora}:00`, tipo))).status).toBe(201);
    }
    const linha = amb.db.prepare('SELECT horas_trabalhadas, situacao_jornada FROM vw_espelho_ponto_diario WHERE data_jornada = ?').get(dia);
    expect(linha).toEqual({ horas_trabalhadas: '0.30', situacao_jornada: 'DEBITO' });
  });

  it('seed é idempotente: executar novamente não duplica cadastros nem cenários', () => {
    const antes = ['OBRA', 'ESCALA_TURNO', 'COLABORADOR', 'REGISTO_PONTO'].map((t) => contar(amb.db, t as 'OBRA'));
    const resumo = executarSeed(amb.db, { agora: hojeAsOitoHoras() });
    expect(resumo).toMatchObject({ obrasInseridas: 0, escalasInseridas: 0, colaboradoresInseridos: 0, batidasInseridas: 0 });
    expect(['OBRA', 'ESCALA_TURNO', 'COLABORADOR', 'REGISTO_PONTO'].map((t) => contar(amb.db, t as 'OBRA'))).toEqual(antes);
    expect(antes).toEqual([1, 1, 2, 2]);
  });

  it('seed exato: obra 10, escala 1 e colaboradores 1024/2048 com SAIDA há 15h e há 10h59min', () => {
    expect(amb.db.prepare('SELECT * FROM OBRA').all()).toEqual([
      { id_obra: 10, codigo_obra: 'OBRA-010', nome_canteiro: 'Arena MRV - Setor A', localidade: 'CAPITAL' },
    ]);
    expect(amb.db.prepare('SELECT * FROM ESCALA_TURNO').all()).toEqual([
      { id_escala: 1, descricao_turno: 'Comercial Obra 08h-17h', carga_horaria_diaria_min: 480, tolerancia_clt_min: 10 },
    ]);
    const saidas = amb.db
      .prepare(
        `SELECT c.matricula, c.nome_completo, c.funcao, c.hash_template_facial, r.data_hora_batida, r.tipo_batida
           FROM COLABORADOR c JOIN REGISTO_PONTO r ON r.id_colaborador = c.id_colaborador ORDER BY c.matricula`,
      )
      .all();
    expect(saidas).toEqual([
      {
        matricula: '1024',
        nome_completo: 'Carlos Souza',
        funcao: 'Pedreiro',
        hash_template_facial: 'hash_facial_carlos_1024',
        data_hora_batida: `${diaRelativo(-1)} 17:00:00`,
        tipo_batida: 'SAIDA',
      },
      {
        matricula: '2048',
        nome_completo: 'Marcos Silva',
        funcao: 'Eletricista',
        hash_template_facial: 'hash_facial_marcos_2048',
        data_hora_batida: `${diaRelativo(-1)} 21:01:00`,
        tipo_batida: 'SAIDA',
      },
    ]);
  });
});
