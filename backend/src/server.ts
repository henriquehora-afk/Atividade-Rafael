import { construirApp } from './app.js';
import { CONFIG } from './config.js';
import { abrirConexao } from './db/conexao.js';
import { executarSeed } from './db/seed.js';

const db = abrirConexao(CONFIG.caminhoBanco);
const seed = executarSeed(db);
const app = construirApp(db, { logger: true });

app.log.info(
  `SGBD: ${CONFIG.caminhoBanco} | seed (idempotente): +${seed.obrasInseridas} obra, +${seed.escalasInseridas} escala, ` +
    `+${seed.colaboradoresInseridos} colaboradores, +${seed.batidasInseridas} batidas de cenario`,
);

try {
  await app.listen({ port: CONFIG.porta, host: CONFIG.host });
} catch (e) {
  app.log.error(e);
  process.exit(1);
}

const encerrar = async () => {
  await app.close();
  db.close();
  process.exit(0);
};
process.on('SIGINT', encerrar);
process.on('SIGTERM', encerrar);
