/**
 * Seed obrigatório e IDEMPOTENTE (pode rodar a cada inicialização).
 *  - Cadastros mestres: INSERT ... ON CONFLICT DO NOTHING (sintaxe comum SQLite/PostgreSQL).
 *  - Cenários de batida: inseridos apenas se o colaborador ainda não tem nenhuma batida
 *    (REGISTO_PONTO é imutável — nunca reescrevemos o histórico).
 */
import type { ConexaoSGBD } from './conexao.js';
import { adicionarMinutos, formatarDataHoraLocal } from '../services/tempo.js';

export const SEED = {
  obra: { id_obra: 10, codigo_obra: 'OBRA-010', nome_canteiro: 'Arena MRV - Setor A', localidade: 'CAPITAL' },
  escala: { id_escala: 1, descricao_turno: 'Comercial Obra 08h-17h', carga_horaria_diaria_min: 480, tolerancia_clt_min: 10 },
  colaboradores: [
    {
      // Cenário CT02 — última SAIDA há mais de 12 horas (15h): ENTRADA permitida.
      nome_completo: 'Carlos Souza',
      matricula: '1024',
      funcao: 'Pedreiro',
      id_escala: 1,
      hash_template_facial: 'hash_facial_carlos_1024',
      minutos_desde_ultima_saida: 15 * 60,
    },
    {
      // Cenário Violação CLT — última SAIDA há exatamente 10h59min: ENTRADA bloqueada (Art. 66).
      nome_completo: 'Marcos Silva',
      matricula: '2048',
      funcao: 'Eletricista',
      id_escala: 1,
      hash_template_facial: 'hash_facial_marcos_2048',
      minutos_desde_ultima_saida: 10 * 60 + 59,
    },
  ],
} as const;

export interface ResumoSeed {
  obrasInseridas: number;
  escalasInseridas: number;
  colaboradoresInseridos: number;
  batidasInseridas: number;
  referencia: string;
}

export function executarSeed(db: ConexaoSGBD, opcoes: { agora?: Date } = {}): ResumoSeed {
  const referencia = formatarDataHoraLocal(opcoes.agora ?? new Date());
  const resumo: ResumoSeed = { obrasInseridas: 0, escalasInseridas: 0, colaboradoresInseridos: 0, batidasInseridas: 0, referencia };

  db.exec('BEGIN');
  try {
    const { obra, escala } = SEED;
    resumo.obrasInseridas += Number(
      db
        .prepare(
          `INSERT INTO OBRA (id_obra, codigo_obra, nome_canteiro, localidade)
           VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        )
        .run(obra.id_obra, obra.codigo_obra, obra.nome_canteiro, obra.localidade).changes,
    );

    resumo.escalasInseridas += Number(
      db
        .prepare(
          `INSERT INTO ESCALA_TURNO (id_escala, descricao_turno, carga_horaria_diaria_min, tolerancia_clt_min)
           VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING`,
        )
        .run(escala.id_escala, escala.descricao_turno, escala.carga_horaria_diaria_min, escala.tolerancia_clt_min).changes,
    );

    for (const c of SEED.colaboradores) {
      resumo.colaboradoresInseridos += Number(
        db
          .prepare(
            `INSERT INTO COLABORADOR (id_escala, matricula, nome_completo, funcao, hash_template_facial)
             VALUES (?, ?, ?, ?, ?) ON CONFLICT (matricula) DO NOTHING`,
          )
          .run(c.id_escala, c.matricula, c.nome_completo, c.funcao, c.hash_template_facial).changes,
      );

      const { id_colaborador } = db.prepare('SELECT id_colaborador FROM COLABORADOR WHERE matricula = ?').get(c.matricula) as {
        id_colaborador: number;
      };
      const { qtd } = db.prepare('SELECT COUNT(*) AS qtd FROM REGISTO_PONTO WHERE id_colaborador = ?').get(id_colaborador) as {
        qtd: number;
      };
      if (qtd === 0) {
        db.prepare(
          `INSERT INTO REGISTO_PONTO (id_colaborador, id_obra, data_hora_batida, tipo_batida, confianca_facial, sincronizado_offline)
           VALUES (?, ?, ?, 'SAIDA', 98.50, 0)`,
        ).run(id_colaborador, obra.id_obra, adicionarMinutos(referencia, -c.minutos_desde_ultima_saida));
        resumo.batidasInseridas++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return resumo;
}
