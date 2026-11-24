/**
 * Participante "Persistencia (SGBD)" do Diagrama de Sequência.
 * ÚNICO ponto do backend que executa SQL. Services nunca acessam o banco diretamente.
 */
import type { SQLInputValue } from 'node:sqlite';
import type { ConexaoSGBD } from '../db/conexao.js';
import type {
  BatidaDetalhada,
  Colaborador,
  ColaboradorDetalhado,
  ConfirmacaoPersistencia,
  EscalaTurno,
  HorasAcumuladas,
  JustificativaAjuste,
  LinhaEspelhoPonto,
  LinhaResumoPresencaObra,
  NovoRegistoPonto,
  Obra,
  RegistoPonto,
  RetornoConsultaColaborador,
} from '../modelos.js';
import type { TipoBatida } from '../services/regrasCLT.js';

type Linha = Record<string, unknown>;

export type JustificativaDetalhada = JustificativaAjuste & {
  matricula: string;
  nome_completo: string;
  data_hora_batida: string;
  tipo_batida: TipoBatida;
};

/** Contrato usado pelo ServicoJornada (permite repositório falso nos testes de unidade). */
export interface RepositorioJornada {
  consultarColaboradorEUltimaSaida(matricula: string, referencia?: string): RetornoConsultaColaborador;
  buscarObraPorId(idObra: number): Obra | null;
  buscarBatidaIdentica(idColaborador: number, dataHora: string, tipo: TipoBatida): RegistoPonto | null;
  inserirRegistoPonto(dados: NovoRegistoPonto): ConfirmacaoPersistencia;
  consultarHorasAcumuladas(idColaborador: number, dataJornada: string): HorasAcumuladas;
}

export interface FiltroBatidas {
  inicio?: string;
  fim?: string;
  id_colaborador?: number;
  id_obra?: number;
  limite?: number;
}

const paraRegisto = (l: Linha): RegistoPonto => ({
  id_registo: Number(l.id_registo),
  id_colaborador: Number(l.id_colaborador),
  id_obra: Number(l.id_obra),
  data_hora_batida: String(l.data_hora_batida),
  tipo_batida: l.tipo_batida as TipoBatida,
  confianca_facial: Number(l.confianca_facial),
  sincronizado_offline: Number(l.sincronizado_offline) === 1,
});

export class PersistenciaSGBD implements RepositorioJornada {
  private readonly db: ConexaoSGBD;

  constructor(db: ConexaoSGBD) {
    this.db = db;
  }

  /** Executa uma função dentro de uma transação (BEGIN/COMMIT/ROLLBACK). */
  transacao<T>(fn: () => T): T {
    this.db.exec('BEGIN');
    try {
      const r = fn();
      this.db.exec('COMMIT');
      return r;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  // =========================================================================
  // Fluxo crítico — Diagrama de Sequência
  // =========================================================================

  /**
   * 3. consultarColaboradorEUltimaSaida(matricula)
   * 4. retorna(status_cadastro, timestamp_ultima_saida)
   *
   * @param referencia data_hora da nova batida: considera apenas SAIDAs até esse
   *        instante (necessário para sincronizações offline fora de ordem).
   */
  consultarColaboradorEUltimaSaida(matricula: string, referencia?: string): RetornoConsultaColaborador {
    const colaborador = this.db
      .prepare(
        `SELECT id_colaborador, id_escala, matricula, nome_completo, funcao, hash_template_facial
           FROM COLABORADOR WHERE matricula = ?`,
      )
      .get(matricula) as Colaborador | undefined;

    if (!colaborador) {
      return { status_cadastro: 'INEXISTENTE', colaborador: null, timestamp_ultima_saida: null };
    }

    const linha = (
      referencia
        ? this.db
            .prepare(
              `SELECT MAX(data_hora_batida) AS ts FROM REGISTO_PONTO
                WHERE id_colaborador = ? AND tipo_batida = 'SAIDA' AND data_hora_batida <= ?`,
            )
            .get(colaborador.id_colaborador, referencia)
        : this.db
            .prepare(`SELECT MAX(data_hora_batida) AS ts FROM REGISTO_PONTO WHERE id_colaborador = ? AND tipo_batida = 'SAIDA'`)
            .get(colaborador.id_colaborador)
    ) as { ts: string | null };

    return { status_cadastro: 'ATIVO', colaborador: { ...colaborador }, timestamp_ultima_saida: linha.ts ?? null };
  }

  buscarBatidaIdentica(idColaborador: number, dataHora: string, tipo: TipoBatida): RegistoPonto | null {
    const l = this.db
      .prepare(
        `SELECT * FROM REGISTO_PONTO
          WHERE id_colaborador = ? AND data_hora_batida = ? AND tipo_batida = ?
          ORDER BY id_registo LIMIT 1`,
      )
      .get(idColaborador, dataHora, tipo) as Linha | undefined;
    return l ? paraRegisto(l) : null;
  }

  /**
   * 5b. INSERT INTO registo_ponto (id_colaborador, id_obra, data_hora_batida, tipo_batida, ...)
   * 6b. confirmacaoPersistencia(id_registo, status_imutavel)
   */
  inserirRegistoPonto(dados: NovoRegistoPonto): ConfirmacaoPersistencia {
    const r = this.db
      .prepare(
        `INSERT INTO REGISTO_PONTO
           (id_colaborador, id_obra, data_hora_batida, tipo_batida, confianca_facial, sincronizado_offline)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        dados.id_colaborador,
        dados.id_obra,
        dados.data_hora_batida,
        dados.tipo_batida,
        dados.confianca_facial,
        dados.sincronizado_offline ? 1 : 0,
      );
    return { id_registo: Number(r.lastInsertRowid), status_imutavel: true };
  }

  consultarHorasAcumuladas(idColaborador: number, dataJornada: string): HorasAcumuladas {
    const l = this.db
      .prepare(
        `SELECT minutos_trabalhados, horas_trabalhadas FROM vw_espelho_ponto_diario
          WHERE id_colaborador = ? AND data_jornada = ?`,
      )
      .get(idColaborador, dataJornada) as { minutos_trabalhados: number; horas_trabalhadas: string } | undefined;
    return {
      minutos_trabalhados: l ? Number(l.minutos_trabalhados) : 0,
      horas_trabalhadas: l ? String(l.horas_trabalhadas) : '0.00',
    };
  }

  // =========================================================================
  // REGISTO_PONTO — leitura e tentativas de alteração (bloqueadas por trigger)
  // =========================================================================

  buscarRegistoPorId(idRegisto: number): RegistoPonto | null {
    const l = this.db.prepare('SELECT * FROM REGISTO_PONTO WHERE id_registo = ?').get(idRegisto) as Linha | undefined;
    return l ? paraRegisto(l) : null;
  }

  listarBatidas(filtro: FiltroBatidas = {}): BatidaDetalhada[] {
    const condicoes: string[] = [];
    const params: SQLInputValue[] = [];
    if (filtro.inicio) {
      condicoes.push('date(r.data_hora_batida) >= ?');
      params.push(filtro.inicio);
    }
    if (filtro.fim) {
      condicoes.push('date(r.data_hora_batida) <= ?');
      params.push(filtro.fim);
    }
    if (filtro.id_colaborador) {
      condicoes.push('r.id_colaborador = ?');
      params.push(filtro.id_colaborador);
    }
    if (filtro.id_obra) {
      condicoes.push('r.id_obra = ?');
      params.push(filtro.id_obra);
    }
    params.push(filtro.limite ?? 500);
    const linhas = this.db
      .prepare(
        `SELECT r.*, c.matricula, c.nome_completo, c.funcao, o.codigo_obra, o.nome_canteiro,
                j.id_ajuste, j.motivo_ajuste, j.responsavel_rh, j.data_hora_registro
           FROM REGISTO_PONTO r
           JOIN COLABORADOR c ON c.id_colaborador = r.id_colaborador
           JOIN OBRA o        ON o.id_obra        = r.id_obra
           LEFT JOIN JUSTIFICATIVA_AJUSTE j ON j.id_registo = r.id_registo
          ${condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : ''}
          ORDER BY r.data_hora_batida DESC, r.id_registo DESC
          LIMIT ?`,
      )
      .all(...params) as Linha[];

    return linhas.map((l) => ({
      ...paraRegisto(l),
      matricula: String(l.matricula),
      nome_completo: String(l.nome_completo),
      funcao: String(l.funcao),
      codigo_obra: String(l.codigo_obra),
      nome_canteiro: String(l.nome_canteiro),
      justificativa:
        l.id_ajuste == null
          ? null
          : {
              id_ajuste: Number(l.id_ajuste),
              id_registo: Number(l.id_registo),
              motivo_ajuste: String(l.motivo_ajuste),
              responsavel_rh: String(l.responsavel_rh),
              data_hora_registro: String(l.data_hora_registro),
            },
    }));
  }

  /** Tenta um UPDATE direto — o trigger do SGBD deve abortar (Portaria 671/2021). */
  tentarAtualizarRegisto(idRegisto: number, novaDataHora: string): number {
    const r = this.db.prepare('UPDATE REGISTO_PONTO SET data_hora_batida = ? WHERE id_registo = ?').run(novaDataHora, idRegisto);
    return Number(r.changes);
  }

  /** Tenta um DELETE direto — o trigger do SGBD deve abortar (Portaria 671/2021). */
  tentarExcluirRegisto(idRegisto: number): number {
    const r = this.db.prepare('DELETE FROM REGISTO_PONTO WHERE id_registo = ?').run(idRegisto);
    return Number(r.changes);
  }

  // =========================================================================
  // JUSTIFICATIVA_AJUSTE (0:1)
  // =========================================================================

  buscarJustificativaPorRegisto(idRegisto: number): JustificativaAjuste | null {
    const l = this.db.prepare('SELECT * FROM JUSTIFICATIVA_AJUSTE WHERE id_registo = ?').get(idRegisto) as
      | JustificativaAjuste
      | undefined;
    return l ? { ...l } : null;
  }

  inserirJustificativa(dados: Omit<JustificativaAjuste, 'id_ajuste'>): JustificativaAjuste {
    const r = this.db
      .prepare(
        `INSERT INTO JUSTIFICATIVA_AJUSTE (id_registo, motivo_ajuste, responsavel_rh, data_hora_registro)
         VALUES (?, ?, ?, ?)`,
      )
      .run(dados.id_registo, dados.motivo_ajuste, dados.responsavel_rh, dados.data_hora_registro);
    return { id_ajuste: Number(r.lastInsertRowid), ...dados };
  }

  listarJustificativas(): JustificativaDetalhada[] {
    return (
      this.db
        .prepare(
          `SELECT j.*, c.matricula, c.nome_completo, r.data_hora_batida, r.tipo_batida
             FROM JUSTIFICATIVA_AJUSTE j
             JOIN REGISTO_PONTO r ON r.id_registo = j.id_registo
             JOIN COLABORADOR c   ON c.id_colaborador = r.id_colaborador
            ORDER BY j.data_hora_registro DESC, j.id_ajuste DESC`,
        )
        .all() as unknown as JustificativaDetalhada[]
    ).map((l) => ({ ...l }));
  }

  // =========================================================================
  // Views de dados derivados
  // =========================================================================

  listarEspelho(filtro: FiltroBatidas = {}): LinhaEspelhoPonto[] {
    const condicoes: string[] = [];
    const params: SQLInputValue[] = [];
    if (filtro.inicio) {
      condicoes.push('data_jornada >= ?');
      params.push(filtro.inicio);
    }
    if (filtro.fim) {
      condicoes.push('data_jornada <= ?');
      params.push(filtro.fim);
    }
    if (filtro.id_colaborador) {
      condicoes.push('id_colaborador = ?');
      params.push(filtro.id_colaborador);
    }
    const linhas = this.db
      .prepare(
        `SELECT * FROM vw_espelho_ponto_diario
          ${condicoes.length ? 'WHERE ' + condicoes.join(' AND ') : ''}
          ORDER BY data_jornada DESC, nome_completo ASC`,
      )
      .all(...params) as Linha[];
    return linhas.map((l) => ({
      ...(l as unknown as LinhaEspelhoPonto),
      possui_ajuste: Number(l.possui_ajuste) === 1,
    }));
  }

  resumoPresencaObras(): LinhaResumoPresencaObra[] {
    return (this.db.prepare('SELECT * FROM vw_resumo_presenca_obra ORDER BY codigo_obra').all() as Linha[]).map(
      (l) => ({ ...(l as unknown as LinhaResumoPresencaObra) }),
    );
  }

  // =========================================================================
  // Cadastros Mestres — OBRA
  // =========================================================================

  listarObras(): Obra[] {
    return (this.db.prepare('SELECT * FROM OBRA ORDER BY codigo_obra').all() as unknown as Obra[]).map((o) => ({ ...o }));
  }

  buscarObraPorId(idObra: number): Obra | null {
    const o = this.db.prepare('SELECT * FROM OBRA WHERE id_obra = ?').get(idObra) as Obra | undefined;
    return o ? { ...o } : null;
  }

  inserirObra(o: Omit<Obra, 'id_obra'> & { id_obra?: number }): Obra {
    const r = this.db
      .prepare('INSERT INTO OBRA (codigo_obra, nome_canteiro, localidade) VALUES (?, ?, ?)')
      .run(o.codigo_obra, o.nome_canteiro, o.localidade);
    return { id_obra: Number(r.lastInsertRowid), codigo_obra: o.codigo_obra, nome_canteiro: o.nome_canteiro, localidade: o.localidade };
  }

  atualizarObra(o: Obra): number {
    return Number(
      this.db
        .prepare('UPDATE OBRA SET codigo_obra = ?, nome_canteiro = ?, localidade = ? WHERE id_obra = ?')
        .run(o.codigo_obra, o.nome_canteiro, o.localidade, o.id_obra).changes,
    );
  }

  excluirObra(idObra: number): number {
    return Number(this.db.prepare('DELETE FROM OBRA WHERE id_obra = ?').run(idObra).changes);
  }

  // =========================================================================
  // Cadastros Mestres — ESCALA_TURNO
  // =========================================================================

  listarEscalas(): EscalaTurno[] {
    return (this.db.prepare('SELECT * FROM ESCALA_TURNO ORDER BY id_escala').all() as unknown as EscalaTurno[]).map((e) => ({ ...e }));
  }

  buscarEscalaPorId(idEscala: number): EscalaTurno | null {
    const e = this.db.prepare('SELECT * FROM ESCALA_TURNO WHERE id_escala = ?').get(idEscala) as EscalaTurno | undefined;
    return e ? { ...e } : null;
  }

  inserirEscala(e: Omit<EscalaTurno, 'id_escala'>): EscalaTurno {
    const r = this.db
      .prepare('INSERT INTO ESCALA_TURNO (descricao_turno, carga_horaria_diaria_min, tolerancia_clt_min) VALUES (?, ?, ?)')
      .run(e.descricao_turno, e.carga_horaria_diaria_min, e.tolerancia_clt_min);
    return { id_escala: Number(r.lastInsertRowid), ...e };
  }

  atualizarEscala(e: EscalaTurno): number {
    return Number(
      this.db
        .prepare('UPDATE ESCALA_TURNO SET descricao_turno = ?, carga_horaria_diaria_min = ?, tolerancia_clt_min = ? WHERE id_escala = ?')
        .run(e.descricao_turno, e.carga_horaria_diaria_min, e.tolerancia_clt_min, e.id_escala).changes,
    );
  }

  excluirEscala(idEscala: number): number {
    return Number(this.db.prepare('DELETE FROM ESCALA_TURNO WHERE id_escala = ?').run(idEscala).changes);
  }

  // =========================================================================
  // Cadastros Mestres — COLABORADOR
  // =========================================================================

  listarColaboradores(): ColaboradorDetalhado[] {
    return (
      this.db
        .prepare(
          `SELECT c.*, e.descricao_turno, e.carga_horaria_diaria_min,
                  (SELECT MAX(r.data_hora_batida) FROM REGISTO_PONTO r
                    WHERE r.id_colaborador = c.id_colaborador AND r.tipo_batida = 'SAIDA') AS ultima_saida,
                  (SELECT COUNT(*) FROM REGISTO_PONTO r WHERE r.id_colaborador = c.id_colaborador) AS total_batidas
             FROM COLABORADOR c
             JOIN ESCALA_TURNO e ON e.id_escala = c.id_escala
            ORDER BY c.nome_completo`,
        )
        .all() as unknown as ColaboradorDetalhado[]
    ).map((c) => ({ ...c }));
  }

  buscarColaboradorPorId(idColaborador: number): Colaborador | null {
    const c = this.db.prepare('SELECT * FROM COLABORADOR WHERE id_colaborador = ?').get(idColaborador) as Colaborador | undefined;
    return c ? { ...c } : null;
  }

  inserirColaborador(c: Omit<Colaborador, 'id_colaborador'>): Colaborador {
    const r = this.db
      .prepare(
        `INSERT INTO COLABORADOR (id_escala, matricula, nome_completo, funcao, hash_template_facial)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(c.id_escala, c.matricula, c.nome_completo, c.funcao, c.hash_template_facial);
    return { id_colaborador: Number(r.lastInsertRowid), ...c };
  }

  atualizarColaborador(c: Colaborador): number {
    return Number(
      this.db
        .prepare(
          `UPDATE COLABORADOR SET id_escala = ?, matricula = ?, nome_completo = ?, funcao = ?, hash_template_facial = ?
            WHERE id_colaborador = ?`,
        )
        .run(c.id_escala, c.matricula, c.nome_completo, c.funcao, c.hash_template_facial, c.id_colaborador).changes,
    );
  }

  excluirColaborador(idColaborador: number): number {
    return Number(this.db.prepare('DELETE FROM COLABORADOR WHERE id_colaborador = ?').run(idColaborador).changes);
  }
}
