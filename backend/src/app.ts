/**
 * Composição da aplicação: Controllers (routes) -> Services -> Repository (SGBD).
 * Recebe a conexão pronta para permitir testes com SGBD em memória.
 */
import Fastify, { type FastifyInstance } from 'fastify';
import type { ConexaoSGBD } from './db/conexao.js';
import { PersistenciaSGBD } from './repositories/PersistenciaSGBD.js';
import { rotasAuditoria } from './routes/auditoriaController.js';
import { rotasCadastros } from './routes/cadastrosController.js';
import { rotasPonto } from './routes/pontoController.js';
import { ErroDominio, traduzirErroSGBD } from './services/erros.js';
import { ReconhecimentoFacial } from './services/ReconhecimentoFacial.js';
import { ServicoAuditoria } from './services/ServicoAuditoria.js';
import { ServicoCadastros } from './services/ServicoCadastros.js';
import { ServicoJornada } from './services/ServicoJornada.js';
import { formatarDataHoraLocal } from './services/tempo.js';

export interface OpcoesApp {
  logger?: boolean;
  relogio?: () => Date;
}

export function construirApp(db: ConexaoSGBD, opcoes: OpcoesApp = {}): FastifyInstance {
  const relogio = opcoes.relogio ?? (() => new Date());
  const app = Fastify({
    logger: opcoes.logger ? { level: 'info', transport: undefined } : false,
    bodyLimit: 2 * 1024 * 1024,
  });

  const persistencia = new PersistenciaSGBD(db);
  const jornada = new ServicoJornada(persistencia, new ReconhecimentoFacial(), relogio);
  const cadastros = new ServicoCadastros(persistencia);
  const auditoria = new ServicoAuditoria(persistencia, relogio);

  app.setErrorHandler((erro, req, reply) => {
    if (erro instanceof ErroDominio) {
      return reply.status(erro.statusCode).send(erro.toJSON());
    }
    const doSGBD = traduzirErroSGBD(erro);
    if (doSGBD) {
      return reply.status(doSGBD.statusCode).send(doSGBD.toJSON());
    }
    const status = (erro as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.status(status).send({
        erro: 'Requisicao invalida',
        detalhes: erro instanceof Error ? erro.message : String(erro),
        codigo: 'DADOS_INVALIDOS',
      });
    }
    req.log.error(erro);
    return reply.status(500).send({
      erro: 'Erro interno do servidor',
      detalhes: erro instanceof Error ? erro.message : String(erro),
      codigo: 'ERRO_INTERNO',
    });
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    servico: 'SGF Modulo 5 - Ponto e Jornada',
    sgbd: 'SQLite (node:sqlite)',
    foreign_keys: (db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number }).foreign_keys === 1,
    horario_servidor: formatarDataHoraLocal(relogio()),
  }));

  rotasPonto(app, jornada, auditoria);
  rotasCadastros(app, cadastros);
  rotasAuditoria(app, auditoria);

  return app;
}
