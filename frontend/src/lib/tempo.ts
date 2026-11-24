// Datas no formato canônico do SGBD: 'YYYY-MM-DD HH:MM:SS' no horário local do canteiro.

const dois = (n: number) => String(n).padStart(2, '0');

export function agoraLocal(data: Date = new Date()): string {
  return (
    `${data.getFullYear()}-${dois(data.getMonth() + 1)}-${dois(data.getDate())} ` +
    `${dois(data.getHours())}:${dois(data.getMinutes())}:${dois(data.getSeconds())}`
  );
}

export function hojeLocal(data: Date = new Date()): string {
  return agoraLocal(data).slice(0, 10);
}

export function somarDias(dataISO: string, dias: number): string {
  const [a, m, d] = dataISO.split('-').map(Number);
  const dt = new Date(a, m - 1, d + dias);
  return hojeLocal(dt);
}

/** '2026-11-24T08:00' (input datetime-local) -> '2026-11-24 08:00:00' */
export function deDatetimeLocal(valor: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::(\d{2}))?/.exec(valor);
  return m ? `${m[1]} ${m[2]}:${m[3] ?? '00'}` : null;
}

/** '2026-11-24 08:00:00' -> '2026-11-24T08:00' */
export function paraDatetimeLocal(valor: string): string {
  return valor.replace(' ', 'T').slice(0, 16);
}

export function msIngenuo(dataHora: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(dataHora);
  if (!m) return NaN;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
}

export function somarMinutos(dataHora: string, minutos: number): string {
  const d = new Date(msIngenuo(dataHora) + minutos * 60_000);
  return (
    `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())} ` +
    `${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())}`
  );
}

/** '2026-11-24 08:05:30' -> '24/11/2026 08:05:30' */
export function formatarDataHora(valor: string | null | undefined, comSegundos = true): string {
  if (!valor) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(valor);
  if (!m) return valor;
  return `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}${comSegundos ? `:${m[6] ?? '00'}` : ''}`;
}

export function formatarHora(valor: string | null | undefined): string {
  if (!valor) return '—';
  return valor.slice(11, 16);
}

export function formatarData(valor: string): string {
  const [a, m, d] = valor.slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function formatarDuracao(minutos: number): string {
  const sinal = minutos < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(minutos));
  return `${sinal}${Math.floor(abs / 60)}h${String(abs % 60).padStart(2, '0')}`;
}
