import { CircleCheckBig, CloudOff, LoaderCircle, TriangleAlert, CircleX } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import type { StatusBatidaLocal } from '../lib/tipos';

export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

type Variante = 'primaria' | 'secundaria' | 'perigo' | 'fantasma' | 'escura';

const VARIANTES: Record<Variante, string> = {
  primaria: 'bg-sgf-primaria text-white hover:bg-sky-700 shadow-sm shadow-sky-900/20',
  secundaria: 'bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50',
  perigo: 'bg-red-600 text-white hover:bg-red-700',
  fantasma: 'text-slate-600 hover:bg-slate-100',
  escura: 'bg-sgf-escuro text-white hover:bg-slate-800',
};

export function Botao({
  variante = 'primaria',
  carregando = false,
  icone,
  className,
  children,
  disabled,
  ...resto
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean; icone?: ReactNode }) {
  return (
    <button
      {...resto}
      disabled={disabled || carregando}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANTES[variante],
        className,
      )}
    >
      {carregando ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : icone}
      {children}
    </button>
  );
}

export function Cartao({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx('rounded-xl border border-slate-200 bg-white shadow-sm', className)}>{children}</section>;
}

const SELOS: Record<StatusBatidaLocal, { rotulo: string; classe: string; Icone: typeof CloudOff }> = {
  SINCRONIZADO: { rotulo: 'Ponto Sincronizado', classe: 'bg-emerald-100 text-emerald-800 ring-emerald-600/25', Icone: CircleCheckBig },
  PENDENTE: { rotulo: 'Offline / Pendente', classe: 'bg-red-100 text-red-700 ring-red-600/25', Icone: CloudOff },
  CONFLITO: { rotulo: 'Conflito / Rejeitado', classe: 'bg-amber-100 text-amber-800 ring-amber-600/30', Icone: TriangleAlert },
  REJEITADO: { rotulo: 'Rejeitado', classe: 'bg-rose-100 text-rose-700 ring-rose-600/25', Icone: CircleX },
};

export function SeloStatus({ status, className }: { status: StatusBatidaLocal; className?: string }) {
  const { rotulo, classe, Icone } = SELOS[status];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', classe, className)}>
      <Icone className="size-3.5" aria-hidden />
      {rotulo}
    </span>
  );
}

export function Etiqueta({ children, cor = 'slate', className }: { children: ReactNode; cor?: 'slate' | 'sky' | 'emerald' | 'amber' | 'red' | 'violet'; className?: string }) {
  const cores = {
    slate: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    sky: 'bg-sky-100 text-sky-800 ring-sky-600/20',
    emerald: 'bg-emerald-100 text-emerald-800 ring-emerald-600/20',
    amber: 'bg-amber-100 text-amber-800 ring-amber-600/25',
    red: 'bg-red-100 text-red-700 ring-red-600/20',
    violet: 'bg-violet-100 text-violet-800 ring-violet-600/20',
  } as const;
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset whitespace-nowrap', cores[cor], className)}>
      {children}
    </span>
  );
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-sm text-slate-500">{children}</p>;
}
