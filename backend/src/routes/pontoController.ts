/**
 * Controller de batidas — porta HTTP da "Interface Mobile" para o ServicoJornada.
 *  1. registarPonto(...)          -> POST /api/pontos
 *  Fila offline                   -> POST /api/pontos/sync
 */
import type { FastifyInstance } from 'fastify';
import type { ServicoAuditoria } from '../services/ServicoAuditoria.js';
import type { ServicoJornada } from '../services/ServicoJornada.js';

export function rotasPonto(app: FastifyInstance, jornada: ServicoJornada, auditoria: ServicoAuditoria): void {
  app.post('/api/pontos', async (req, reply) => {
    // 2. validarERegistarBatida(dadosEntrada)
    const retorno = jornada.validarERegistarBatida(req.body);
    return reply.status(retorno.duplicado ? 200 : 201).send(retorno);
  });

  app.post('/api/pontos/sync', async (req) => jornada.sincronizarFila(req.body));

  app.get('/api/pontos', async (req) => auditoria.listarBatidas(req.query as Record<string, unknown>));

  // Demonstração da Portaria 671/2021: o SGBD recusa UPDATE/DELETE (sempre 409).
  app.put<{ Params: { id: string } }>('/api/pontos/:id', async (req) => auditoria.tentarAlterarBatida(req.params.id, req.body));
  app.delete<{ Params: { id: string } }>('/api/pontos/:id', async (req) => auditoria.tentarExcluirBatida(req.params.id));
}
