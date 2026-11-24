/**
 * Teste de SISTEMA ponta a ponta do fluxo Offline-First:
 *   código REAL do frontend (fila Dexie/IndexedDB via fake-indexeddb, servicoCampo, sincronizacao)
 *   → HTTP real → API Fastify → ServicoJornada → SGBD SQLite → Views.
 */
import 'fake-indexeddb/auto';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { definirBaseUrlApi } from '../../../frontend/src/lib/api';
import { dbLocal } from '../../../frontend/src/lib/dbLocal';
import { atualizarCacheCadastros, registarPonto } from '../../../frontend/src/lib/servicoCampo';
import { listarPendentes, sincronizarPendentes } from '../../../frontend/src/lib/sincronizacao';
import { MSG_MATRICULA_OU_INTERJORNADA } from '../../src/services/erros.js';
import { contar, criarAmbiente, hoje, hojeAs, idColaborador } from '../ambiente.js';

type Ambiente = Awaited<ReturnType<typeof criarAmbiente>>;

const capturaCarlos = {
  matricula: '1024',
  foto_hash: 'hash_facial_carlos_1024',
  data_hora_batida: hojeAs('08:00'),
  id_obra: 10,
  tipo_batida: 'ENTRADA' as const,
  confianca_facial: 97.45,
};

describe('[V-Model 3 · Sistema] Fluxo Offline → fila local → Sync preservando o horário original', () => {
  let amb: Ambiente;
  let urlApi: string;

  beforeAll(async () => {
    amb = await criarAmbiente();
    await amb.app.listen({ port: 0, host: '127.0.0.1' });
    urlApi = `http://127.0.0.1:${(amb.app.server.address() as AddressInfo).port}`;
    definirBaseUrlApi(urlApi);
    // O app do fiscal baixa o cache de cadastros enquanto ainda tem conexão.
    await atualizarCacheCadastros();
  });

  afterAll(async () => {
    await dbLocal.delete();
    await amb.fechar();
  });

  it('cache offline contém os cadastros mestres (validação sem internet)', async () => {
    expect(await dbLocal.colaboradores.count()).toBe(2);
    expect((await dbLocal.obras.get(10))?.nome_canteiro).toBe('Arena MRV - Setor A');
  });

  it('OFFLINE: batida do Carlos Souza (1024) às 08:00 vai para a fila local com sincronizado_offline = true em < 2 s', async () => {
    const inicio = performance.now();
    const r = await registarPonto(capturaCarlos, { online: false });
    const decorrido = performance.now() - inicio;

    expect(r.tipo).toBe('PENDENTE');
    expect(decorrido).toBeLessThan(2000);
    if (r.tipo !== 'PENDENTE') throw new Error('esperado PENDENTE');
    expect(r.tempoMs).toBeLessThan(2000);

    const fila = await listarPendentes();
    expect(fila).toHaveLength(1);
    expect(fila[0]).toMatchObject({
      matricula: '1024',
      nome_colaborador: 'Carlos Souza',
      data_hora_batida: hojeAs('08:00'),
      sincronizado_offline: true,
      status: 'PENDENTE',
    });
  });

  it('OFFLINE: nada chega ao SGBD enquanto não houver conexão', () => {
    const qtd = amb.db
      .prepare('SELECT COUNT(*) AS qtd FROM REGISTO_PONTO WHERE id_colaborador = ? AND date(data_hora_batida) = ?')
      .get(idColaborador(amb.db, '1024'), hoje()) as { qtd: number };
    expect(qtd.qtd).toBe(0);
  });

  it('OFFLINE: ENTRADA do Marcos (2048) também entra na fila — interjornada é só aviso local', async () => {
    const r = await registarPonto(
      { ...capturaCarlos, matricula: '2048', foto_hash: 'hash_facial_marcos_2048' },
      { online: false },
    );
    expect(r.tipo).toBe('PENDENTE');
    expect(r.batida.aviso).toMatch(/Interjornada/);
  });

  it('OFFLINE: matrícula fora do cache local é rejeitada na hora, sem entrar na fila', async () => {
    const r = await registarPonto({ ...capturaCarlos, matricula: '99999', foto_hash: 'x' }, { online: false });
    expect(r.tipo).toBe('REJEITADO');
    expect(await dbLocal.batidas.where('status').equals('PENDENTE').count()).toBe(2);
  });

  it('ONLINE: sync envia a fila cronologicamente; Carlos → SINCRONIZADO com 08:00 preservado no SGBD', async () => {
    const resumo = await sincronizarPendentes();
    expect(resumo).toEqual({ enviados: 2, sincronizados: 1, conflitos: 1 });

    const local = await dbLocal.batidas.where('matricula').equals('1024').first();
    expect(local).toMatchObject({ status: 'SINCRONIZADO', data_hora_batida: hojeAs('08:00') });
    expect(local?.id_registo).toBeGreaterThan(0);

    const noSGBD = amb.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = ?').get(local!.id_registo!);
    expect(noSGBD).toMatchObject({
      id_colaborador: idColaborador(amb.db, '1024'),
      id_obra: 10,
      data_hora_batida: hojeAs('08:00'),
      tipo_batida: 'ENTRADA',
      sincronizado_offline: 1,
    });
  });

  it('ONLINE: item rejeitado por regra CLT fica como CONFLITO com motivo visível (sem perda silenciosa)', async () => {
    const marcos = await dbLocal.batidas.where('matricula').equals('2048').first();
    expect(marcos).toMatchObject({ status: 'CONFLITO', erro: MSG_MATRICULA_OU_INTERJORNADA, codigo: 'VIOLACAO_INTERJORNADA' });
    expect(marcos?.detalhes).toContain('10h59min');
    expect(await dbLocal.batidas.where('status').equals('PENDENTE').count()).toBe(0);
  });

  it('a batida sincronizada aparece nas Views (espelho com 08:00 e resumo da obra)', () => {
    const espelho = amb.db
      .prepare('SELECT * FROM vw_espelho_ponto_diario WHERE id_colaborador = ? AND data_jornada = ?')
      .get(idColaborador(amb.db, '1024'), hoje());
    expect(espelho).toMatchObject({ primeira_batida: hojeAs('08:00'), batidas_offline: 1, total_batidas: 1 });

    const resumo = amb.db.prepare('SELECT * FROM vw_resumo_presenca_obra WHERE id_obra = 10').get();
    expect(resumo).toMatchObject({ sincronizados_offline_hoje: 1, colaboradores_presentes: 1, batidas_hoje: 1 });
  });

  it('reenvio da mesma batida (resposta perdida) é idempotente: não duplica a ocorrência', async () => {
    const antes = contar(amb.db, 'REGISTO_PONTO');
    const r = await request(urlApi)
      .post('/api/pontos/sync')
      .send({ batidas: [{ ...capturaCarlos, id_local: 'reenvio-1' }] });
    expect(r.status).toBe(200);
    expect(r.body.resultados[0]).toMatchObject({ status: 'SINCRONIZADO', duplicado: true });
    expect(contar(amb.db, 'REGISTO_PONTO')).toBe(antes);
  });

  it('falha de rede real numa batida "online" cai automaticamente na fila offline', async () => {
    definirBaseUrlApi('http://127.0.0.1:9'); // porta sem servidor
    let falhou = false;
    const r = await registarPonto(
      { ...capturaCarlos, tipo_batida: 'SAIDA_ALMOCO', data_hora_batida: hojeAs('12:00') },
      { online: true, aoFalharRede: () => (falhou = true) },
    );
    expect(falhou).toBe(true);
    expect(r.tipo).toBe('PENDENTE');

    definirBaseUrlApi(urlApi);
    expect(await sincronizarPendentes()).toEqual({ enviados: 1, sincronizados: 1, conflitos: 0 });
    const horas = amb.db
      .prepare('SELECT horas_trabalhadas FROM vw_espelho_ponto_diario WHERE id_colaborador = ? AND data_jornada = ?')
      .get(idColaborador(amb.db, '1024'), hoje());
    expect(horas).toEqual({ horas_trabalhadas: '4.00' });
  });
});
