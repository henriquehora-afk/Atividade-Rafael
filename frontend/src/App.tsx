import { HardHat, LayoutDashboard, Smartphone } from 'lucide-react';
import { useState } from 'react';
import ModoCampo from './campo/ModoCampo';
import { cx } from './componentes/ui';
import ModoEscritorio from './escritorio/ModoEscritorio';

type Modo = 'campo' | 'escritorio';
const CHAVE_MODO = 'sgf:modo';

export default function App() {
  const [modo, setModo] = useState<Modo>(() => (localStorage.getItem(CHAVE_MODO) === 'escritorio' ? 'escritorio' : 'campo'));

  const trocar = (m: Modo) => {
    localStorage.setItem(CHAVE_MODO, m);
    setModo(m);
  };

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-sgf-escuro text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-lg bg-sgf-primaria/20 ring-1 ring-sgf-destaque/40">
              <HardHat className="size-5 text-sgf-destaque" aria-hidden />
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-bold tracking-tight">SGF · Gestão e Fiscalização de Obras</p>
              <p className="text-[11px] text-slate-400">Módulo 5 — Controle de Ponto e Jornada de Operários</p>
            </div>
          </div>

          <nav aria-label="Alternar modo" className="flex rounded-xl bg-slate-800/80 p-1 ring-1 ring-slate-700">
            {(
              [
                { id: 'campo', rotulo: 'Modo Campo', sub: 'App do Fiscal', Icone: Smartphone },
                { id: 'escritorio', rotulo: 'Modo Escritório', sub: 'Dashboard RH', Icone: LayoutDashboard },
              ] as const
            ).map(({ id, rotulo, sub, Icone }) => (
              <button
                key={id}
                type="button"
                onClick={() => trocar(id)}
                aria-pressed={modo === id}
                className={cx(
                  'flex items-center gap-2 rounded-lg px-3 py-1.5 text-left transition',
                  modo === id ? 'bg-sgf-primaria text-white shadow' : 'text-slate-300 hover:bg-slate-700/70 hover:text-white',
                )}
              >
                <Icone className="size-4 shrink-0" aria-hidden />
                <span className="leading-tight">
                  <span className="block text-sm font-semibold">{rotulo}</span>
                  <span className={cx('block text-[10px]', modo === id ? 'text-sky-100' : 'text-slate-400')}>{sub}</span>
                </span>
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main>{modo === 'campo' ? <ModoCampo /> : <ModoEscritorio />}</main>
    </div>
  );
}
