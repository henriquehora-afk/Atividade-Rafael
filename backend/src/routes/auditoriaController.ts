/** Controller do Gestor de RH: /api/justificativas e /api/dashboard/*. */
import type { FastifyInstance } from 'fastify';
import type { ServicoAuditoria } from '../services/ServicoAuditoria.js';

export function rotasAuditoria(app: FastifyInstance, auditoria: ServicoAuditoria): void {
  app.get('/api/justificativas', async () => auditoria.listarJustificativas());
  app.post('/api/justificativas', async (req, reply) => reply.status(201).send(auditoria.registrarJustificativa(req.body)));

  // KPIs alimentados por vw_resumo_presenca_obra
  app.get('/api/dashboard/resumo', async () => auditoria.resumoDashboard());
  // Espelho de ponto alimentado por vw_espelho_ponto_diario
  app.get('/api/dashboard/espelho', async (req) => auditoria.espelho(req.query as Record<string, unknown>));
}
