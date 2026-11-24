// Tipos compartilhados do frontend (espelham as entidades do DER e as respostas da API).

export type TipoBatida = 'ENTRADA' | 'SAIDA_ALMOCO' | 'VOLTA_ALMOCO' | 'SAIDA';

export const TIPOS_BATIDA: { valor: TipoBatida; rotulo: string }[] = [
  { valor: 'ENTRADA', rotulo: 'Entrada' },
  { valor: 'SAIDA_ALMOCO', rotulo: 'Saída almoço' },
  { valor: 'VOLTA_ALMOCO', rotulo: 'Volta almoço' },
  { valor: 'SAIDA', rotulo: 'Saída' },
];

export const rotuloTipo = (t: TipoBatida) => TIPOS_BATIDA.find((x) => x.valor === t)?.rotulo ?? t;

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
  descricao_turno?: string;
  carga_horaria_diaria_min?: number;
  ultima_saida?: string | null;
  total_batidas?: number;
}

/** Dados de entrada de 1. registarPonto(...) */
export interface DadosBatida {
  matricula: string;
  foto_hash: string;
  data_hora_batida: string;
  id_obra: number;
  tipo_batida: TipoBatida;
  confianca_facial: number;
}

export interface ComprovantePonto {
  id_registo: number;
  matricula: string;
  nome_completo: string;
  funcao: string;
  id_obra: number;
  codigo_obra: string;
  nome_canteiro: string;
  data_hora_batida: string;
  tipo_batida: TipoBatida;
  confianca_facial: number;
  sincronizado_offline: boolean;
  status_imutavel: true;
  emitido_em: string;
}

/** 7b. retornoSucesso(comprovante_ponto, horas_acumuladas) */
export interface RetornoSucesso {
  id_registo: number;
  status_imutavel: true;
  data_hora_batida: string;
  horas_acumuladas: string;
  minutos_acumulados: number;
  duplicado: boolean;
  mensagem: string;
  comprovante_ponto: ComprovantePonto;
}

export interface ResultadoItemSync {
  id_local: string;
  status: 'SINCRONIZADO' | 'CONFLITO';
  data_hora_batida: string | null;
  id_registo?: number;
  horas_acumuladas?: string;
  duplicado?: boolean;
  comprovante_ponto?: ComprovantePonto;
  erro?: string;
  detalhes?: string;
  codigo?: string;
  http_status?: number;
}

export interface ResultadoSync {
  total: number;
  aceitos: number;
  rejeitados: number;
  resultados: ResultadoItemSync[];
}

/** Status de uma batida no dispositivo do fiscal. */
export type StatusBatidaLocal = 'SINCRONIZADO' | 'PENDENTE' | 'CONFLITO' | 'REJEITADO';

export interface BatidaLocal extends DadosBatida {
  id_local: string;
  nome_colaborador: string | null;
  nome_obra: string | null;
  sincronizado_offline: boolean;
  status: StatusBatidaLocal;
  criado_em: string;
  tempo_gravacao_ms?: number;
  aviso?: string;
  id_registo?: number;
  horas_acumuladas?: string;
  sincronizado_em?: string;
  erro?: string;
  detalhes?: string;
  codigo?: string;
}

export interface JustificativaAjuste {
  id_ajuste: number;
  id_registo: number;
  motivo_ajuste: string;
  responsavel_rh: string;
  data_hora_registro: string;
}

export interface BatidaDetalhada {
  id_registo: number;
  id_colaborador: number;
  id_obra: number;
  data_hora_batida: string;
  tipo_batida: TipoBatida;
  confianca_facial: number;
  sincronizado_offline: boolean;
  matricula: string;
  nome_completo: string;
  funcao: string;
  codigo_obra: string;
  nome_canteiro: string;
  justificativa: JustificativaAjuste | null;
}

export type SituacaoJornada = 'EM_ANDAMENTO' | 'INCOMPLETA' | 'HORA_EXTRA' | 'DEBITO' | 'CONFORME';

export interface LinhaEspelho {
  id_colaborador: number;
  matricula: string;
  nome_completo: string;
  funcao: string;
  descricao_turno: string;
  carga_horaria_diaria_min: number;
  tolerancia_clt_min: number;
  data_jornada: string;
  total_batidas: number;
  batidas_offline: number;
  primeira_batida: string;
  ultima_batida: string;
  minutos_trabalhados: number;
  horas_trabalhadas: string;
  carga_horaria_horas: string;
  saldo_minutos: number;
  situacao_jornada: SituacaoJornada;
  possui_ajuste: boolean;
  qtd_ajustes: number;
  batidas: BatidaDetalhada[];
}

export interface LinhaResumoObra {
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
  obras: LinhaResumoObra[];
}
