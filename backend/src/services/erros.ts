import { MENSAGEM_IMUTABILIDADE, MENSAGEM_JUSTIFICATIVA_IMUTAVEL } from '../db/schemaSqlite.js';

/** Mensagem exata do fragmento alt do Diagrama de Sequência (5a. erroValidacao). */
export const MSG_MATRICULA_OU_INTERJORNADA = 'Matricula invalida ou violacao Interjornada < 11h';

export type CodigoErro =
  | 'DADOS_INVALIDOS'
  | 'CONFIANCA_FACIAL_INSUFICIENTE'
  | 'BIOMETRIA_DIVERGENTE'
  | 'COLABORADOR_INEXISTENTE'
  | 'OBRA_INEXISTENTE'
  | 'VIOLACAO_INTERJORNADA'
  | 'REGISTRO_INEXISTENTE'
  | 'JUSTIFICATIVA_DUPLICADA'
  | 'RECURSO_INEXISTENTE'
  | 'REGISTRO_IMUTAVEL'
  | 'INTEGRIDADE_REFERENCIAL'
  | 'DUPLICIDADE'
  | 'RESTRICAO_CHECK'
  | 'ERRO_INTERNO';

/** Erro de regra de negócio com status HTTP e payload { erro, detalhes, codigo }. */
export class ErroDominio extends Error {
  readonly statusCode: number;
  readonly erro: string;
  readonly detalhes: string;
  readonly codigo: CodigoErro;

  constructor(statusCode: number, erro: string, detalhes: string, codigo: CodigoErro) {
    super(`${erro}: ${detalhes}`);
    this.name = 'ErroDominio';
    this.statusCode = statusCode;
    this.erro = erro;
    this.detalhes = detalhes;
    this.codigo = codigo;
  }

  toJSON() {
    return { erro: this.erro, detalhes: this.detalhes, codigo: this.codigo };
  }
}

/**
 * Traduz erros levantados pelo próprio SGBD (constraints, triggers) em ErroDominio.
 * Retorna null se não for um erro reconhecido do SQLite.
 */
export function traduzirErroSGBD(e: unknown): ErroDominio | null {
  if (!(e instanceof Error)) return null;
  const msg = e.message;
  if (msg.includes(MENSAGEM_IMUTABILIDADE)) {
    return new ErroDominio(409, MENSAGEM_IMUTABILIDADE, 'Operacao bloqueada pelo trigger do SGBD. Use JUSTIFICATIVA_AJUSTE para retificar.', 'REGISTRO_IMUTAVEL');
  }
  if (msg.includes(MENSAGEM_JUSTIFICATIVA_IMUTAVEL)) {
    return new ErroDominio(409, MENSAGEM_JUSTIFICATIVA_IMUTAVEL, 'Operacao bloqueada pelo trigger do SGBD.', 'REGISTRO_IMUTAVEL');
  }
  if (msg.includes('FOREIGN KEY constraint failed')) {
    return new ErroDominio(409, 'Violacao de integridade referencial', 'O registro possui dependencias ou referencia uma chave inexistente (FOREIGN KEY).', 'INTEGRIDADE_REFERENCIAL');
  }
  if (msg.includes('UNIQUE constraint failed')) {
    const campo = msg.split('UNIQUE constraint failed:')[1]?.trim() ?? '';
    return new ErroDominio(409, 'Registro duplicado', `Valor ja cadastrado (${campo}).`, 'DUPLICIDADE');
  }
  if (msg.includes('CHECK constraint failed')) {
    return new ErroDominio(422, 'Restricao de dominio violada', msg, 'RESTRICAO_CHECK');
  }
  if (msg.includes('NOT NULL constraint failed')) {
    return new ErroDominio(400, 'Dados de entrada invalidos', msg, 'DADOS_INVALIDOS');
  }
  return null;
}
