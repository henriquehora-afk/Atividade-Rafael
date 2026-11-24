/**
 * Regras trabalhistas puras (sem I/O) — alvo dos testes de UNIDADE do V-Model.
 */
import { segundosEntre } from './tempo.js';

export type TipoBatida = 'ENTRADA' | 'SAIDA_ALMOCO' | 'VOLTA_ALMOCO' | 'SAIDA';
export const TIPOS_BATIDA: readonly TipoBatida[] = ['ENTRADA', 'SAIDA_ALMOCO', 'VOLTA_ALMOCO', 'SAIDA'];
export const TIPOS_ENTRADA: readonly TipoBatida[] = ['ENTRADA', 'VOLTA_ALMOCO'];
export const TIPOS_SAIDA: readonly TipoBatida[] = ['SAIDA_ALMOCO', 'SAIDA'];

/** CLT Art. 66: mínimo de 11 horas consecutivas de descanso entre duas jornadas. */
export const INTERJORNADA_MINIMA_MIN = 660;
/** Confiança mínima exigida do reconhecimento facial. */
export const CONFIANCA_FACIAL_MINIMA = 85;

export interface AvaliacaoInterjornada {
  conforme: boolean;
  /** Intervalo em minutos inteiros (truncado) desde a última SAIDA; null se não houver. */
  intervaloMinutos: number | null;
  intervaloSegundos: number | null;
  minimoMinutos: number;
  /** Minutos que ainda faltam para cumprir o descanso (0 se conforme). */
  faltamMinutos: number;
}

/**
 * Avalia o intervalo interjornada (Art. 66 CLT) entre a última SAIDA e uma nova ENTRADA.
 * A comparação é feita em SEGUNDOS: 10h59min59s ainda viola; 11h00min00s é conforme.
 */
export function avaliarInterjornada(ultimaSaida: string | null | undefined, novaEntrada: string): AvaliacaoInterjornada {
  if (!ultimaSaida) {
    return { conforme: true, intervaloMinutos: null, intervaloSegundos: null, minimoMinutos: INTERJORNADA_MINIMA_MIN, faltamMinutos: 0 };
  }
  const segundos = segundosEntre(ultimaSaida, novaEntrada);
  const minimoSegundos = INTERJORNADA_MINIMA_MIN * 60;
  const conforme = segundos >= minimoSegundos;
  return {
    conforme,
    intervaloMinutos: Math.floor(segundos / 60),
    intervaloSegundos: segundos,
    minimoMinutos: INTERJORNADA_MINIMA_MIN,
    faltamMinutos: conforme ? 0 : Math.ceil((minimoSegundos - segundos) / 60),
  };
}

/** Formata minutos como '10h59min'. Aceita negativos. */
export function formatarDuracao(minutos: number): string {
  const sinal = minutos < 0 ? '-' : '';
  const abs = Math.abs(minutos);
  return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}min`;
}

/**
 * Converte minutos inteiros em horas DECIMAL(10,2) usando apenas aritmética inteira:
 * centésimos = (min * 100 + 30) / 60 (divisão inteira, arredondamento half-up).
 * Idêntico ao cálculo da view vw_espelho_ponto_diario.
 */
export function minutosParaCentesimos(minutos: number): number {
  if (!Number.isInteger(minutos)) throw new Error('minutos deve ser inteiro');
  if (minutos < 0) return -minutosParaCentesimos(-minutos);
  return Math.floor((minutos * 100 + 30) / 60);
}

export function minutosParaHorasDecimal(minutos: number): string {
  const c = minutosParaCentesimos(minutos);
  const sinal = c < 0 ? '-' : '';
  const abs = Math.abs(c);
  return `${sinal}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/**
 * Soma intervalos (em minutos inteiros) e só então converte para horas decimais.
 * Evita o acúmulo de erro de ponto flutuante (ex.: 0.1 + 0.2 = 0.30000000000000004)
 * e o erro de arredondar parcela a parcela.
 */
export function somarIntervalosEmHoras(intervalosMin: number[]): string {
  const total = intervalosMin.reduce((acc, m) => {
    if (!Number.isInteger(m)) throw new Error('intervalos devem ser minutos inteiros');
    return acc + m;
  }, 0);
  return minutosParaHorasDecimal(total);
}

export interface BatidaParaCalculo {
  tipo_batida: TipoBatida;
  data_hora_batida: string;
}

/**
 * Pareia batidas de um mesmo dia (entrada -> saída seguinte) e devolve minutos trabalhados.
 * Espelha a lógica da view vw_espelho_ponto_diario (LEAD sobre a janela ordenada).
 */
export function calcularMinutosTrabalhados(batidas: BatidaParaCalculo[]): number {
  const ordenadas = [...batidas].sort((a, b) => a.data_hora_batida.localeCompare(b.data_hora_batida));
  let segundos = 0;
  for (let i = 0; i < ordenadas.length - 1; i++) {
    const atual = ordenadas[i];
    const proxima = ordenadas[i + 1];
    if (TIPOS_ENTRADA.includes(atual.tipo_batida) && TIPOS_SAIDA.includes(proxima.tipo_batida)) {
      segundos += segundosEntre(atual.data_hora_batida, proxima.data_hora_batida);
    }
  }
  return Math.floor(segundos / 60);
}

/**
 * Arredonda a confiança facial para 2 casas (DECIMAL(5,2)) sem viés binário:
 * desloca a vírgula pela notação decimal ('84.995e2' = 8499.5 exato) em vez de
 * multiplicar por 100 (84.995 * 100 = 8499.499999…).
 */
export function normalizarConfianca(valor: number): number {
  const deslocado = Number(`${valor}e2`);
  if (!Number.isFinite(deslocado)) return Math.round(valor * 100) / 100;
  return Number(`${Math.round(deslocado)}e-2`);
}
