/**
 * Utilitários de data/hora.
 *
 * Convenção do SGBD: data_hora_batida é gravada como texto canônico
 * 'YYYY-MM-DD HH:MM:SS' no horário LOCAL do canteiro (wall-clock da captura).
 * Diferenças são calculadas tratando esse texto como UTC "ingênuo", o que dá o
 * mesmo resultado de strftime('%s', ...) no SQLite e independe do fuso do servidor.
 */

const REGEX_INGENUO = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,6})?)?$/;
const REGEX_COM_FUSO = /(?:[Zz]|[+-]\d{2}:?\d{2})$/;

const dois = (n: number) => String(n).padStart(2, '0');

/** Formata um Date no horário local do processo como 'YYYY-MM-DD HH:MM:SS'. */
export function formatarDataHoraLocal(data: Date): string {
  return (
    `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())} ` +
    `${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`
  );
}

/** Data local 'YYYY-MM-DD'. */
export function formatarDataLocal(data: Date): string {
  return formatarDataHoraLocal(data).slice(0, 10);
}

/**
 * Normaliza a entrada para 'YYYY-MM-DD HH:MM:SS'.
 * Aceita 'YYYY-MM-DD HH:MM[:SS]', 'YYYY-MM-DDTHH:MM[:SS[.sss]]' (horário local do
 * canteiro) ou ISO-8601 com fuso (convertido para o horário local do servidor).
 * Retorna null se inválido.
 */
export function normalizarDataHora(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  const m = REGEX_INGENUO.exec(texto);
  if (m) {
    const [ano, mes, dia, hora, minuto, segundo] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
    const ms = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
    const d = new Date(ms);
    if (
      d.getUTCFullYear() !== ano ||
      d.getUTCMonth() !== mes - 1 ||
      d.getUTCDate() !== dia ||
      d.getUTCHours() !== hora ||
      d.getUTCMinutes() !== minuto ||
      d.getUTCSeconds() !== segundo
    ) {
      return null;
    }
    return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${dois(segundo)}`;
  }
  if (REGEX_COM_FUSO.test(texto)) {
    const d = new Date(texto);
    if (Number.isNaN(d.getTime())) return null;
    return formatarDataHoraLocal(d);
  }
  return null;
}

/** Converte o texto canônico em milissegundos "ingênuos" (aritmética sem fuso). */
export function paraMilissegundosIngenuos(dataHora: string): number {
  const m = REGEX_INGENUO.exec(dataHora);
  if (!m) throw new Error(`data_hora invalida: ${dataHora}`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

/** Soma (ou subtrai) minutos a um texto canônico, devolvendo texto canônico. */
export function adicionarMinutos(dataHora: string, minutos: number): string {
  const d = new Date(paraMilissegundosIngenuos(dataHora) + minutos * 60_000);
  return (
    `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())} ` +
    `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())}`
  );
}

/** Diferença em segundos inteiros (b - a). */
export function segundosEntre(a: string, b: string): number {
  return Math.trunc((paraMilissegundosIngenuos(b) - paraMilissegundosIngenuos(a)) / 1000);
}
