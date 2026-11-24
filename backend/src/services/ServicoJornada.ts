/**
 * Participante "Servico de Jornada (Regra)" do Diagrama de Sequência.
 *
 *  2. validarERegistarBatida(dadosEntrada)
 *  3. consultarColaboradorEUltimaSaida(matricula)        -> PersistenciaSGBD
 *  4. retorna(status_cadastro, timestamp_ultima_saida)   <- PersistenciaSGBD
 *  alt [Colaborador inexistente ou Interjornada < 11h]
 *     5a. erroValidacao("Matricula invalida ou violacao Interjornada < 11h")
 *  else [Dados validos e conformidade validada]
 *     5b. INSERT INTO registo_ponto (...)                -> PersistenciaSGBD
 *     6b. confirmacaoPersistencia(id_registo, status_imutavel)
 *     7b. retornoSucesso(comprovante_ponto, horas_acumuladas)
 *
 * Atomicidade: o node:sqlite é síncrono e há uma única conexão por processo, portanto
 * consulta + INSERT executam sem intercalação de outras requisições.
 */
import type { Obra } from '../modelos.js';
import type { RepositorioJornada } from '../repositories/PersistenciaSGBD.js';
import { ErroDominio, MSG_MATRICULA_OU_INTERJORNADA, traduzirErroSGBD, type CodigoErro } from './erros.js';
import { ReconhecimentoFacial } from './ReconhecimentoFacial.js';
import {
  avaliarInterjornada,
  CONFIANCA_FACIAL_MINIMA,
  formatarDuracao,
  normalizarConfianca,
  TIPOS_BATIDA,
  type TipoBatida,
} from './regrasCLT.js';
import { formatarDataHoraLocal, normalizarDataHora } from './tempo.js';

export interface DadosEntradaBatida {
  matricula: string;
  foto_hash: string;
  data_hora_batida: string;
  id_obra: number;
  tipo_batida: TipoBatida;
  confianca_facial: number;
  sincronizado_offline: boolean;
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
  mensagem: 'Ponto Sincronizado';
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
  codigo?: CodigoErro;
  http_status?: number;
}

export interface ResultadoSync {
  total: number;
  aceitos: number;
  rejeitados: number;
  resultados: ResultadoItemSync[];
}

export const LIMITE_LOTE_SYNC = 500;

type Bruto = Record<string, unknown>;

function texto(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length ? t : null;
}

function numero(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return null;
}

function booleano(v: unknown, padrao: boolean): boolean | null {
  if (v === undefined || v === null) return padrao;
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return null;
}

export class ServicoJornada {
  private readonly persistencia: RepositorioJornada;
  private readonly reconhecimento: ReconhecimentoFacial;
  private readonly relogio: () => Date;

  constructor(persistencia: RepositorioJornada, reconhecimento = new ReconhecimentoFacial(), relogio: () => Date = () => new Date()) {
    this.persistencia = persistencia;
    this.reconhecimento = reconhecimento;
    this.relogio = relogio;
  }

  /**
   * Passo 2 (parte 1): validação sintática dos campos obrigatórios e da confiança
   * facial mínima. Lança ErroDominio 400/422 antes de qualquer acesso ao SGBD.
   */
  validarDadosEntrada(dadosEntrada: unknown): DadosEntradaBatida {
    if (!dadosEntrada || typeof dadosEntrada !== 'object' || Array.isArray(dadosEntrada)) {
      throw new ErroDominio(400, 'Dados de entrada invalidos', 'Corpo da requisicao deve ser um objeto JSON.', 'DADOS_INVALIDOS');
    }
    const d = dadosEntrada as Bruto;
    const invalidos: string[] = [];

    const matricula = texto(d.matricula);
    if (!matricula || matricula.length > 30) invalidos.push('matricula');

    const fotoHash = texto(d.foto_hash);
    if (!fotoHash || fotoHash.length > 255) invalidos.push('foto_hash');

    // Aceita o nome do diagrama (data_hora) e o nome físico da coluna (data_hora_batida).
    const dataHora = normalizarDataHora(d.data_hora_batida ?? d.data_hora);
    if (!dataHora) invalidos.push('data_hora_batida');

    const idObra = numero(d.id_obra);
    if (idObra === null || !Number.isInteger(idObra) || idObra <= 0) invalidos.push('id_obra');

    const tipo = texto(d.tipo_batida)?.toUpperCase() as TipoBatida | undefined;
    if (!tipo || !TIPOS_BATIDA.includes(tipo)) invalidos.push('tipo_batida');

    const confianca = numero(d.confianca_facial);
    if (confianca === null || confianca < 0 || confianca > 100) invalidos.push('confianca_facial');

    const offline = booleano(d.sincronizado_offline, false);
    if (offline === null) invalidos.push('sincronizado_offline');

    if (invalidos.length) {
      throw new ErroDominio(
        400,
        'Dados de entrada invalidos',
        `Campos obrigatorios ausentes ou invalidos: ${invalidos.join(', ')}. ` +
          `tipo_batida aceita ${TIPOS_BATIDA.join(' | ')}; confianca_facial entre 0.00 e 100.00; ` +
          `data_hora_batida no formato YYYY-MM-DD HH:MM[:SS].`,
        'DADOS_INVALIDOS',
      );
    }

    const confiancaNormalizada = normalizarConfianca(confianca as number);
    if (confiancaNormalizada < CONFIANCA_FACIAL_MINIMA) {
      throw new ErroDominio(
        422,
        'Reconhecimento facial reprovado',
        `Confianca facial ${confiancaNormalizada.toFixed(2)}% abaixo do minimo exigido de ${CONFIANCA_FACIAL_MINIMA.toFixed(2)}%. Repita a captura.`,
        'CONFIANCA_FACIAL_INSUFICIENTE',
      );
    }

    return {
      matricula: matricula as string,
      foto_hash: fotoHash as string,
      data_hora_batida: dataHora as string,
      id_obra: idObra as number,
      tipo_batida: tipo as TipoBatida,
      confianca_facial: confiancaNormalizada,
      sincronizado_offline: offline as boolean,
    };
  }

  /** 2. validarERegistarBatida(dadosEntrada) — operação crítica completa. */
  validarERegistarBatida(dadosEntrada: unknown): RetornoSucesso {
    const dados = this.validarDadosEntrada(dadosEntrada);

    // 3. consultarColaboradorEUltimaSaida(matricula)  /  4. retorna(status_cadastro, timestamp_ultima_saida)
    const consulta = this.persistencia.consultarColaboradorEUltimaSaida(dados.matricula, dados.data_hora_batida);
    const obra: Obra | null = this.persistencia.buscarObraPorId(dados.id_obra);

    // ---- alt [Colaborador inexistente ...] -> 5a. erroValidacao (aborta ANTES do INSERT)
    if (consulta.status_cadastro === 'INEXISTENTE' || !consulta.colaborador) {
      throw new ErroDominio(404, MSG_MATRICULA_OU_INTERJORNADA, `Matricula ${dados.matricula} nao cadastrada no SGBD (COLABORADOR).`, 'COLABORADOR_INEXISTENTE');
    }
    if (!obra) {
      throw new ErroDominio(404, MSG_MATRICULA_OU_INTERJORNADA, `Obra id_obra=${dados.id_obra} nao cadastrada no SGBD (OBRA).`, 'OBRA_INEXISTENTE');
    }
    const colaborador = consulta.colaborador;

    // Biometria: foto_hash x hash_template_facial
    const biometria = this.reconhecimento.comparar(dados.foto_hash, colaborador.hash_template_facial);
    if (!biometria.confere) {
      throw new ErroDominio(
        422,
        'Reconhecimento facial reprovado',
        `foto_hash nao confere com o hash_template_facial da matricula ${dados.matricula}.`,
        'BIOMETRIA_DIVERGENTE',
      );
    }

    // Idempotência do sync offline: reenvio da mesma batida não duplica a ocorrência.
    const existente = this.persistencia.buscarBatidaIdentica(colaborador.id_colaborador, dados.data_hora_batida, dados.tipo_batida);
    if (existente) {
      return this.montarRetorno(existente.id_registo, { ...dados, sincronizado_offline: existente.sincronizado_offline, confianca_facial: existente.confianca_facial }, colaborador, obra, true);
    }

    // ---- alt [... ou Interjornada < 11h] -> 5a. erroValidacao
    if (dados.tipo_batida === 'ENTRADA') {
      const av = avaliarInterjornada(consulta.timestamp_ultima_saida, dados.data_hora_batida);
      if (!av.conforme) {
        throw new ErroDominio(
          422,
          MSG_MATRICULA_OU_INTERJORNADA,
          `Violacao Interjornada (CLT Art. 66): intervalo de ${formatarDuracao(av.intervaloMinutos ?? 0)} desde a ultima SAIDA ` +
            `(${consulta.timestamp_ultima_saida}) e inferior aos ${av.minimoMinutos} min (11h00min) exigidos. ` +
            `Faltam ${av.faltamMinutos} min para a liberacao.`,
          'VIOLACAO_INTERJORNADA',
        );
      }
    }

    // ---- else [Dados validos e conformidade validada]
    // 5b. INSERT INTO registo_ponto  /  6b. confirmacaoPersistencia(id_registo, status_imutavel)
    const confirmacao = this.persistencia.inserirRegistoPonto({
      id_colaborador: colaborador.id_colaborador,
      id_obra: obra.id_obra,
      data_hora_batida: dados.data_hora_batida,
      tipo_batida: dados.tipo_batida,
      confianca_facial: dados.confianca_facial,
      sincronizado_offline: dados.sincronizado_offline,
    });

    // 7b. retornoSucesso(comprovante_ponto, horas_acumuladas)
    return this.montarRetorno(confirmacao.id_registo, dados, colaborador, obra, false);
  }

  /**
   * POST /api/pontos/sync — processa a fila offline em ordem CRONOLÓGICA (data_hora_batida
   * original), forçando sincronizado_offline = true. Cada item é independente: rejeições
   * viram CONFLITO com motivo (sem perda silenciosa) e não interrompem o lote.
   */
  sincronizarFila(payload: unknown): ResultadoSync {
    const lote = (payload as Bruto | null)?.batidas;
    if (!Array.isArray(lote)) {
      throw new ErroDominio(400, 'Dados de entrada invalidos', 'Envie { batidas: [...] } com a fila offline.', 'DADOS_INVALIDOS');
    }
    if (lote.length > LIMITE_LOTE_SYNC) {
      throw new ErroDominio(400, 'Dados de entrada invalidos', `Lote excede ${LIMITE_LOTE_SYNC} batidas.`, 'DADOS_INVALIDOS');
    }

    const itens = lote.map((bruto, indice) => {
      const item = (bruto && typeof bruto === 'object' ? bruto : {}) as Bruto;
      return {
        indice,
        item,
        id_local: texto(item.id_local) ?? `item-${indice}`,
        dataHora: normalizarDataHora(item.data_hora_batida ?? item.data_hora),
      };
    });
    itens.sort((a, b) => {
      if (a.dataHora && b.dataHora && a.dataHora !== b.dataHora) return a.dataHora < b.dataHora ? -1 : 1;
      if (!a.dataHora !== !b.dataHora) return a.dataHora ? 1 : -1;
      return a.indice - b.indice;
    });

    const resultados: ResultadoItemSync[] = itens.map(({ item, id_local, dataHora }) => {
      try {
        const r = this.validarERegistarBatida({ ...item, sincronizado_offline: true });
        return {
          id_local,
          status: 'SINCRONIZADO',
          data_hora_batida: r.data_hora_batida,
          id_registo: r.id_registo,
          horas_acumuladas: r.horas_acumuladas,
          duplicado: r.duplicado,
          comprovante_ponto: r.comprovante_ponto,
        };
      } catch (e) {
        const erro =
          e instanceof ErroDominio
            ? e
            : (traduzirErroSGBD(e) ?? new ErroDominio(500, 'Erro interno ao sincronizar', e instanceof Error ? e.message : String(e), 'ERRO_INTERNO'));
        return {
          id_local,
          status: 'CONFLITO',
          data_hora_batida: dataHora,
          erro: erro.erro,
          detalhes: erro.detalhes,
          codigo: erro.codigo,
          http_status: erro.statusCode,
        };
      }
    });

    const aceitos = resultados.filter((r) => r.status === 'SINCRONIZADO').length;
    return { total: resultados.length, aceitos, rejeitados: resultados.length - aceitos, resultados };
  }

  private montarRetorno(
    idRegisto: number,
    dados: DadosEntradaBatida,
    colaborador: { id_colaborador: number; matricula: string; nome_completo: string; funcao: string },
    obra: Obra,
    duplicado: boolean,
  ): RetornoSucesso {
    const horas = this.persistencia.consultarHorasAcumuladas(colaborador.id_colaborador, dados.data_hora_batida.slice(0, 10));
    return {
      id_registo: idRegisto,
      status_imutavel: true,
      data_hora_batida: dados.data_hora_batida,
      horas_acumuladas: horas.horas_trabalhadas,
      minutos_acumulados: horas.minutos_trabalhados,
      duplicado,
      mensagem: 'Ponto Sincronizado',
      comprovante_ponto: {
        id_registo: idRegisto,
        matricula: colaborador.matricula,
        nome_completo: colaborador.nome_completo,
        funcao: colaborador.funcao,
        id_obra: obra.id_obra,
        codigo_obra: obra.codigo_obra,
        nome_canteiro: obra.nome_canteiro,
        data_hora_batida: dados.data_hora_batida,
        tipo_batida: dados.tipo_batida,
        confianca_facial: dados.confianca_facial,
        sincronizado_offline: dados.sincronizado_offline,
        status_imutavel: true,
        emitido_em: formatarDataHoraLocal(this.relogio()),
      },
    };
  }
}
