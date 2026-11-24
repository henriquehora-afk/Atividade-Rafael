/**
 * Recria o banco de demonstração (apaga o arquivo .db e reaplica o seed).
 * Não executa UPDATE/DELETE em REGISTO_PONTO — o arquivo inteiro é descartado.
 * Pare o `npm run dev` antes (no Windows o arquivo fica bloqueado pelo servidor).
 */
import { existsSync, rmSync } from 'node:fs';
import { CONFIG } from '../config.js';
import { abrirConexao } from '../db/conexao.js';
import { executarSeed } from '../db/seed.js';

for (const sufixo of ['', '-wal', '-shm']) {
  const arquivo = CONFIG.caminhoBanco + sufixo;
  if (existsSync(arquivo)) {
    try {
      rmSync(arquivo);
    } catch {
      console.error(`Nao foi possivel apagar ${arquivo}. Pare o servidor (npm run dev) e tente novamente.`);
      process.exit(1);
    }
  }
}

const db = abrirConexao(CONFIG.caminhoBanco);
const resumo = executarSeed(db);
db.close();
console.log(`Banco recriado em ${CONFIG.caminhoBanco}`);
console.log(`Seed aplicado (referencia ${resumo.referencia}):`, resumo);
console.log('Cenario Marcos (2048): ultima SAIDA ha 10h59min — a violacao Interjornada vale pelos proximos 60 segundos.');
