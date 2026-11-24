/**
 * Ambiente de teste: SGBD SQLite REAL em memória + seed + app Fastify.
 * O seed recebe "agora = hoje 08:00" para os cenários serem determinísticos:
 *   Carlos (1024): última SAIDA ontem 17:00 (15h antes)      -> ENTRADA 08:00 permitida
 *   Marcos (2048): última SAIDA ontem 21:01 (10h59min antes) -> ENTRADA 08:00 bloqueada
 */
import { construirApp } from '../src/app.js';
import { abrirConexao, type ConexaoSGBD } from '../src/db/conexao.js';
import { executarSeed } from '../src/db/seed.js';
import { adicionarMinutos, formatarDataLocal } from '../src/services/tempo.js';

export const hoje = (): string => formatarDataLocal(new Date());
export const hojeAs = (hhmm: string): string => `${hoje()} ${hhmm}:00`;
export const diaRelativo = (dias: number): string => adicionarMinutos(`${hoje()} 00:00:00`, dias * 24 * 60).slice(0, 10);

export function hojeAsOitoHoras(): Date {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}

export async function criarAmbiente(opcoes: { agoraSeed?: Date } = {}) {
  const db = abrirConexao(':memory:');
  const seed = executarSeed(db, { agora: opcoes.agoraSeed ?? hojeAsOitoHoras() });
  const app = construirApp(db);
  await app.ready();
  return {
    db,
    app,
    seed,
    async fechar() {
      await app.close();
      db.close();
    },
  };
}

export function contar(db: ConexaoSGBD, tabela: 'OBRA' | 'ESCALA_TURNO' | 'COLABORADOR' | 'REGISTO_PONTO' | 'JUSTIFICATIVA_AJUSTE'): number {
  return Number((db.prepare(`SELECT COUNT(*) AS qtd FROM ${tabela}`).get() as { qtd: number }).qtd);
}

export function idColaborador(db: ConexaoSGBD, matricula: string): number {
  return Number((db.prepare('SELECT id_colaborador FROM COLABORADOR WHERE matricula = ?').get(matricula) as { id_colaborador: number }).id_colaborador);
}

export const batidaCarlos = (dataHora: string, tipo = 'ENTRADA', extra: Record<string, unknown> = {}) => ({
  matricula: '1024',
  foto_hash: 'hash_facial_carlos_1024',
  data_hora_batida: dataHora,
  id_obra: 10,
  tipo_batida: tipo,
  confianca_facial: 97.45,
  sincronizado_offline: false,
  ...extra,
});
