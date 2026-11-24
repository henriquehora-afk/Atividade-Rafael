/** Controller dos Cadastros Mestres: /api/obras, /api/escalas, /api/colaboradores. */
import type { FastifyInstance } from 'fastify';
import type { ServicoCadastros } from '../services/ServicoCadastros.js';

type ComId = { Params: { id: string } };

export function rotasCadastros(app: FastifyInstance, cadastros: ServicoCadastros): void {
  // OBRA
  app.get('/api/obras', async () => cadastros.listarObras());
  app.post('/api/obras', async (req, reply) => reply.status(201).send(cadastros.criarObra(req.body)));
  app.put<ComId>('/api/obras/:id', async (req) => cadastros.atualizarObra(req.params.id, req.body));
  app.delete<ComId>('/api/obras/:id', async (req, reply) => {
    cadastros.excluirObra(req.params.id);
    return reply.status(204).send();
  });

  // ESCALA_TURNO
  app.get('/api/escalas', async () => cadastros.listarEscalas());
  app.post('/api/escalas', async (req, reply) => reply.status(201).send(cadastros.criarEscala(req.body)));
  app.put<ComId>('/api/escalas/:id', async (req) => cadastros.atualizarEscala(req.params.id, req.body));
  app.delete<ComId>('/api/escalas/:id', async (req, reply) => {
    cadastros.excluirEscala(req.params.id);
    return reply.status(204).send();
  });

  // COLABORADOR
  app.get('/api/colaboradores', async () => cadastros.listarColaboradores());
  app.post('/api/colaboradores', async (req, reply) => reply.status(201).send(cadastros.criarColaborador(req.body)));
  app.put<ComId>('/api/colaboradores/:id', async (req) => cadastros.atualizarColaborador(req.params.id, req.body));
  app.delete<ComId>('/api/colaboradores/:id', async (req, reply) => {
    cadastros.excluirColaborador(req.params.id);
    return reply.status(204).send();
  });
}
