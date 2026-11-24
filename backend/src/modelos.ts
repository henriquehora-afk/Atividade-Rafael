import type { TipoBatida } from './services/regrasCLT.js';

// ---------------------------------------------------------------------------
// Entidades (espelho 1:1 das tabelas do DER)
// ---------------------------------------------------------------------------
export interface Obra {
  id_obra: number;
  codigo_obra: string;
  nome_canteiro: string;
  localidade: string;
}

export interface EscalaTurno {
  id_escala: number;
  descricao_turno: string;
  carga_horaria_diaria_min: number;
  tolerancia_clt_min: number;
}

export interface Colaborador {
  id_colaborador: number;
  id_escala: number;
  matricula: string;
  nome_completo: string;
  funcao: string;
  hash_template_facial: string;
}

export interface RegistoPonto {
  id_registo: number;
  id_colaborador: number;
  id_obra: number;
  data_hora_batida: string;
  tipo_batida: TipoBatida;
  confianca_facial: number;
  sincronizado_offline: boolean;
}

export interface JustificativaAjuste {
  id_ajuste: number;
  id_registo: number;
  motivo_ajuste: string;
  responsavel_rh: string;
  data_hora_registro: string;
}

// ---------------------------------------------------------------------------
// Projeções de leitura (JOINs / views — dados derivados, nunca persistidos)
// ---------------------------------------------------------------------------
export interface ColaboradorDetalhado extends Colaborador {
  descricao_turno: string;
  carga_horaria_diaria_min: number;
  ultima_saida: string | null;
  total_batidas: number;
}

export interface BatidaDetalhada extends RegistoPonto {
  matricula: string;
  nome_completo: string;
  funcao: string;
  codigo_obra: string;
  nome_canteiro: string;
  justificativa: JustificativaAjuste | null;
}

export interface LinhaEspelhoPonto {
  id_colaborador: number;
  matricula: string;
  nome_completo: string;
  funcao: string;
  id_escala: number;
  descricao_turno: string;
  carga_horaria_diaria_min: number;
  tolerancia_clt_min: number;
  data_jornada: string;
  total_batidas: number;
  batidas_offline: number;
  primeira_batida: string;
  ultima_batida: string;
  tipo_ultima_batida: TipoBatida;
  minutos_trabalhados: number;
  centesimos_trabalhados: number;
  horas_trabalhadas: string;
  carga_horaria_horas: string;
  saldo_minutos: number;
  situacao_jornada: 'EM_ANDAMENTO' | 'INCOMPLETA' | 'HORA_EXTRA' | 'DEBITO' | 'CONFORME';
  possui_ajuste: boolean;
  qtd_ajustes: number;
}

export interface LinhaResumoPresencaObra {
  id_obra: number;
  codigo_obra: string;
  nome_canteiro: string;
  localidade: string;
  colaboradores_presentes: number;
  batidas_hoje: number;
  sincronizados_offline_hoje: number;
  total_sincronizado_offline: number;
  total_batidas: number;
  total_ajustes_auditados: number;
}

// ---------------------------------------------------------------------------
// Mensagens do Diagrama de Sequência
// ---------------------------------------------------------------------------
/** 4. retorna(status_cadastro, timestamp_ultima_saida) */
export interface RetornoConsultaColaborador {
  status_cadastro: 'ATIVO' | 'INEXISTENTE';
  colaborador: Colaborador | null;
  timestamp_ultima_saida: string | null;
}

/** 5b. INSERT INTO registo_ponto (...) */
export interface NovoRegistoPonto {
  id_colaborador: number;
  id_obra: number;
  data_hora_batida: string;
  tipo_batida: TipoBatida;
  confianca_facial: number;
  sincronizado_offline: boolean;
}

/** 6b. confirmacaoPersistencia(id_registo, status_imutavel) */
export interface ConfirmacaoPersistencia {
  id_registo: number;
  status_imutavel: true;
}

export interface HorasAcumuladas {
  minutos_trabalhados: number;
  horas_trabalhadas: string;
}
