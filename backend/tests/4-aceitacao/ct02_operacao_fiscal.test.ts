/**
 * CT02 — Teste de ACEITAÇÃO da operação do Fiscal de Obra (critérios do cliente),
 * exercitando a API pública como o app mobile e o dashboard do RH fazem.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MSG_MATRICULA_OU_INTERJORNADA } from '../../src/services/erros.js';
import { batidaCarlos, contar, criarAmbiente, hojeAs, idColaborador } from '../ambiente.js';

type Ambiente = Awaited<ReturnType<typeof criarAmbiente>>;

async function presentesObra10(amb: Ambiente) {
  const r = await request(amb.app.server).get('/api/dashboard/resumo');
  expect(r.status).toBe(200);
  const obra = r.body.obras.find((o: { id_obra: number }) => o.id_obra === 10);
  return { obra, kpis: r.body.kpis };
}

describe('[V-Model 4 · Aceitação] CT02 — Operação do Fiscal na Arena MRV - Setor A', () => {
  let amb: Ambiente;
  beforeEach(async () => {
    amb = await criarAmbiente();
  });
  afterEach(async () => amb.fechar());

  it('batida facial válida de Carlos Souza (1024) às 08:00 grava ocorrência, devolve comprovante e incrementa presentes', async () => {
    const antes = await presentesObra10(amb);
    expect(antes.obra.colaboradores_presentes).toBe(0);
    const mestresAntes = { obra: contar(amb.db, 'OBRA'), escala: contar(amb.db, 'ESCALA_TURNO'), colab: contar(amb.db, 'COLABORADOR') };

    // 1. registarPonto → 2. validarERegistarBatida → 5b. INSERT → 7b. retornoSucesso
    const r = await request(amb.app.server).post('/api/pontos').send(batidaCarlos(hojeAs('08:00')));

    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      status_imutavel: true,
      data_hora_batida: hojeAs('08:00'),
      horas_acumuladas: '0.00',
      mensagem: 'Ponto Sincronizado',
      duplicado: false,
    });
    expect(r.body.id_registo).toBeGreaterThan(0);
    expect(r.body.comprovante_ponto).toMatchObject({
      id_registo: r.body.id_registo,
      matricula: '1024',
      nome_completo: 'Carlos Souza',
      funcao: 'Pedreiro',
      id_obra: 10,
      codigo_obra: 'OBRA-010',
      nome_canteiro: 'Arena MRV - Setor A',
      tipo_batida: 'ENTRADA',
      confianca_facial: 97.45,
      status_imutavel: true,
    });

    // Sem duplicar dados mestres: cadastros intactos e a ocorrência guarda apenas FKs (3FN).
    expect({ obra: contar(amb.db, 'OBRA'), escala: contar(amb.db, 'ESCALA_TURNO'), colab: contar(amb.db, 'COLABORADOR') }).toEqual(mestresAntes);
    const colunas = (amb.db.prepare('PRAGMA table_info(REGISTO_PONTO)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(colunas).toEqual(['id_registo', 'id_colaborador', 'id_obra', 'data_hora_batida', 'tipo_batida', 'confianca_facial', 'sincronizado_offline']);
    expect(amb.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = ?').get(r.body.id_registo)).toEqual({
      id_registo: r.body.id_registo,
      id_colaborador: idColaborador(amb.db, '1024'),
      id_obra: 10,
      data_hora_batida: hojeAs('08:00'),
      tipo_batida: 'ENTRADA',
      confianca_facial: 97.45,
      sincronizado_offline: 0,
    });

    // Dashboard (view vw_resumo_presenca_obra): presentes +1
    const depois = await presentesObra10(amb);
    expect(depois.obra.colaboradores_presentes).toBe(antes.obra.colaboradores_presentes + 1);
    expect(depois.obra.batidas_hoje).toBe(antes.obra.batidas_hoje + 1);
    expect(depois.kpis.colaboradores_presentes).toBe(1);
  });

  it('jornada completa do Carlos: horas acumuladas do comprovante seguem a view e ele deixa de constar como presente', async () => {
    const esperado: Array<[string, string, string, number]> = [
      ['08:00', 'ENTRADA', '0.00', 1],
      ['12:00', 'SAIDA_ALMOCO', '4.00', 0],
      ['13:00', 'VOLTA_ALMOCO', '4.00', 1],
      ['17:00', 'SAIDA', '8.00', 0],
    ];
    for (const [hora, tipo, horas, presentes] of esperado) {
      const r = await request(amb.app.server).post('/api/pontos').send(batidaCarlos(hojeAs(hora), tipo));
      expect(r.status).toBe(201);
      expect(r.body.horas_acumuladas).toBe(horas);
      expect((await presentesObra10(amb)).obra.colaboradores_presentes).toBe(presentes);
    }
    const espelho = await request(amb.app.server).get(`/api/dashboard/espelho?inicio=${hojeAs('00:00').slice(0, 10)}`);
    const carlos = espelho.body.find((l: { matricula: string }) => l.matricula === '1024');
    expect(carlos).toMatchObject({ horas_trabalhadas: '8.00', saldo_minutos: 0, situacao_jornada: 'CONFORME', total_batidas: 4 });
    expect(carlos.batidas).toHaveLength(4);
  });

  it('fiscal recebe alerta de violação CLT para Marcos Silva (2048) às 08:00 — nada é gravado', async () => {
    const antes = contar(amb.db, 'REGISTO_PONTO');
    const r = await request(amb.app.server)
      .post('/api/pontos')
      .send({ ...batidaCarlos(hojeAs('08:00')), matricula: '2048', foto_hash: 'hash_facial_marcos_2048' });
    expect(r.status).toBe(422);
    expect(r.body).toMatchObject({ erro: MSG_MATRICULA_OU_INTERJORNADA, codigo: 'VIOLACAO_INTERJORNADA' });
    expect(r.body.detalhes).toContain('10h59min');
    expect(contar(amb.db, 'REGISTO_PONTO')).toBe(antes);
    expect((await presentesObra10(amb)).obra.colaboradores_presentes).toBe(0);
  });

  it('RH registra justificativa sem editar a batida e o KPI "Ajustes Auditados" é incrementado', async () => {
    const b = await request(amb.app.server).post('/api/pontos').send(batidaCarlos(hojeAs('08:00')));
    const j = await request(amb.app.server)
      .post('/api/justificativas')
      .send({ id_registo: b.body.id_registo, motivo_ajuste: 'Conferido com o diario de obra.', responsavel_rh: 'Ana RH' });
    expect(j.status).toBe(201);
    const { kpis } = await presentesObra10(amb);
    expect(kpis.ajustes_auditados).toBe(1);
    expect(amb.db.prepare('SELECT data_hora_batida FROM REGISTO_PONTO WHERE id_registo = ?').get(b.body.id_registo)).toEqual({
      data_hora_batida: hojeAs('08:00'),
    });
  });
});
