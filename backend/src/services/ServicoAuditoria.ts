/**
 * Regras do Gestor de RH: dashboard (views SQL), espelho de ponto e
 * justificativas de ajuste (retificação 0:1 sem alterar a batida original).
 */
import type { BatidaDetalhada, JustificativaAjuste, LinhaEspelhoPonto, LinhaResumoPresencaObra } from '../modelos.js';
import type { FiltroBatidas, PersistenciaSGBD } from '../repositories/PersistenciaSGBD.js';
import { ErroDominio, traduzirErroSGBD } from './erros.js';
import { formatarDataHoraLocal, formatarDataLocal, normalizarDataHora } from './tempo.js';

export interface ResumoDashboard {
  gerado_em: string;
  data_referencia: string;
  kpis: {
    colaboradores_presentes: number;
    batidas_hoje: number;
    sincronizados_offline: number;
    sincronizados_offline_total: number;
    ajustes_auditados: number;
  };
  obras: LinhaResumoPresencaObra[];
}

export interface LinhaEspelhoComBatidas extends LinhaEspelhoPonto {
  batidas: BatidaDetalhada[];
}

const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

export class ServicoAuditoria {
  private readonly persistencia: PersistenciaSGBD;
  private readonly relogio: () => Date;

  constructor(persistencia: PersistenciaSGBD, relogio: () => Date = () => new Date()) {
    this.persistencia = persistencia;
    this.relogio = relogio;
  }

  /** KPIs do Dashboard — todos derivados de vw_resumo_presenca_obra. */
  resumoDashboard(): ResumoDashboard {
    const obras = this.persistencia.resumoPresencaObras();
    const soma = (campo: keyof LinhaResumoPresencaObra) => obras.reduce((acc, o) => acc + Number(o[campo] ?? 0), 0);
    const agora = this.relogio();
    return {
      gerado_em: formatarDataHoraLocal(agora),
      data_referencia: formatarDataLocal(agora),
      kpis: {
        colaboradores_presentes: soma('colaboradores_presentes'),
        batidas_hoje: soma('batidas_hoje'),
        sincronizados_offline: soma('sincronizados_offline_hoje'),
        sincronizados_offline_total: soma('total_sincronizado_offline'),
        ajustes_auditados: soma('total_ajustes_auditados'),
      },
      obras,
    };
  }

  private filtro(query: Record<string, unknown>): FiltroBatidas {
    const f: FiltroBatidas = {};
    for (const campo of ['inicio', 'fim'] as const) {
      const v = query[campo];
      if (v !== undefined && v !== '') {
        if (typeof v !== 'string' || !REGEX_DATA.test(v)) {
          throw new ErroDominio(400, 'Dados de entrada invalidos', `${campo} deve estar no formato YYYY-MM-DD.`, 'DADOS_INVALIDOS');
        }
        f[campo] = v;
      }
    }
    for (const campo of ['id_colaborador', 'id_obra'] as const) {
      const v = query[campo];
      if (v !== undefined && v !== '') {
        const n = Number(v);
        if (!Number.isInteger(n) || n <= 0) {
          throw new ErroDominio(400, 'Dados de entrada invalidos', `${campo} invalido.`, 'DADOS_INVALIDOS');
        }
        f[campo] = n;
      }
    }
    if (query.limite !== undefined) {
      const n = Number(query.limite);
      if (Number.isInteger(n) && n > 0) f.limite = Math.min(n, 2000);
    }
    return f;
  }

  /** Espelho de ponto (vw_espelho_ponto_diario) + batidas originais de cada dia. */
  espelho(query: Record<string, unknown>): LinhaEspelhoComBatidas[] {
    const f = this.filtro(query);
    const linhas = this.persistencia.listarEspelho(f);
    const batidas = this.persistencia.listarBatidas({ ...f, limite: 5000 });
    const porDia = new Map<string, BatidaDetalhada[]>();
    for (const b of batidas) {
      const chave = `${b.id_colaborador}|${b.data_hora_batida.slice(0, 10)}`;
      const lista = porDia.get(chave) ?? [];
      lista.push(b);
      porDia.set(chave, lista);
    }
    return linhas.map((l) => ({
      ...l,
      batidas: (porDia.get(`${l.id_colaborador}|${l.data_jornada}`) ?? []).sort((a, b) =>
        a.data_hora_batida.localeCompare(b.data_hora_batida),
      ),
    }));
  }

  listarBatidas(query: Record<string, unknown>): BatidaDetalhada[] {
    return this.persistencia.listarBatidas(this.filtro(query));
  }

  listarJustificativas() {
    return this.persistencia.listarJustificativas();
  }

  /** INSERT em JUSTIFICATIVA_AJUSTE (0:1). A batida original permanece intacta. */
  registrarJustificativa(corpo: unknown): JustificativaAjuste {
    if (!corpo || typeof corpo !== 'object') {
      throw new ErroDominio(400, 'Dados de entrada invalidos', 'Corpo da requisicao deve ser um objeto JSON.', 'DADOS_INVALIDOS');
    }
    const d = corpo as Record<string, unknown>;
    const idRegisto = Number(d.id_registo);
    const motivo = typeof d.motivo_ajuste === 'string' ? d.motivo_ajuste.trim() : '';
    const responsavel = typeof d.responsavel_rh === 'string' ? d.responsavel_rh.trim() : '';
    const invalidos: string[] = [];
    if (!Number.isInteger(idRegisto) || idRegisto <= 0) invalidos.push('id_registo');
    if (motivo.length < 10) invalidos.push('motivo_ajuste (minimo 10 caracteres)');
    if (!responsavel || responsavel.length > 150) invalidos.push('responsavel_rh');
    if (invalidos.length) {
      throw new ErroDominio(400, 'Dados de entrada invalidos', `Campos invalidos: ${invalidos.join(', ')}.`, 'DADOS_INVALIDOS');
    }
    if (!this.persistencia.buscarRegistoPorId(idRegisto)) {
      throw new ErroDominio(404, 'Registro de ponto inexistente', `id_registo=${idRegisto} nao encontrado em REGISTO_PONTO.`, 'REGISTRO_INEXISTENTE');
    }
    if (this.persistencia.buscarJustificativaPorRegisto(idRegisto)) {
      throw new ErroDominio(
        409,
        'Registro ja possui justificativa',
        `id_registo=${idRegisto} ja foi retificado. Cardinalidade REGISTO_PONTO -> JUSTIFICATIVA_AJUSTE e 0:1.`,
        'JUSTIFICATIVA_DUPLICADA',
      );
    }
    return this.persistencia.inserirJustificativa({
      id_registo: idRegisto,
      motivo_ajuste: motivo,
      responsavel_rh: responsavel,
      data_hora_registro: formatarDataHoraLocal(this.relogio()),
    });
  }

  /**
   * Tenta alterar/excluir uma batida diretamente no SGBD. Existe apenas para
   * DEMONSTRAR que o trigger de imutabilidade bloqueia a operação (sempre 409).
   */
  tentarAlterarBatida(id: unknown, corpo: unknown): never {
    const idRegisto = Number(id);
    const novaDataHora = normalizarDataHora((corpo as Record<string, unknown> | null)?.data_hora_batida) ?? '2000-01-01 00:00:00';
    this.executarTentativa(idRegisto, () => this.persistencia.tentarAtualizarRegisto(idRegisto, novaDataHora));
  }

  tentarExcluirBatida(id: unknown): never {
    const idRegisto = Number(id);
    this.executarTentativa(idRegisto, () => this.persistencia.tentarExcluirRegisto(idRegisto));
  }

  private executarTentativa(idRegisto: number, operacao: () => number): never {
    if (!Number.isInteger(idRegisto) || !this.persistencia.buscarRegistoPorId(idRegisto)) {
      throw new ErroDominio(404, 'Registro de ponto inexistente', `id_registo=${idRegisto} nao encontrado.`, 'REGISTRO_INEXISTENTE');
    }
    try {
      operacao();
    } catch (e) {
      throw traduzirErroSGBD(e) ?? e;
    }
    // Se chegou aqui, o trigger não existe — situação que nunca deve ocorrer.
    throw new ErroDominio(500, 'Falha de integridade', 'Trigger de imutabilidade ausente no SGBD!', 'ERRO_INTERNO');
  }
}
