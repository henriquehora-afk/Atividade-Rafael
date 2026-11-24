import { ArrowRight, ListChecks, Play } from 'lucide-react';
import { Botao } from '../componentes/ui';

export interface Cenario {
  id: string;
  titulo: string;
  descricao: string;
  esperado: string;
  aplicar: () => void;
}

const PARTICIPANTES = ['Fiscal de Obra', 'Interface Mobile', 'ServicoJornada (Regra)', 'Persistencia (SGBD)'];

/** Painel lateral (desktop) com o roteiro dos cenários de teste para apresentação em aula. */
export default function RoteiroDemo({ cenarios }: { cenarios: Cenario[] }) {
  return (
    <aside className="mt-6 space-y-4 px-4 pb-10 sm:px-0 lg:sticky lg:top-24 lg:mt-0">
      <div>
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-sgf-escuro">
          <ListChecks className="size-5 text-sgf-primaria" aria-hidden /> Roteiro de demonstração
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Cada cenário preenche o app do fiscal; depois toque em <strong>Simular Captura Facial e Registrar</strong>. Acompanhe o
          efeito no <strong>Modo Escritório</strong>.
        </p>
      </div>

      <ol className="grid gap-2.5 xl:grid-cols-2">
        {cenarios.map((c, i) => (
          <li key={c.id} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-[10px] font-bold tracking-wider text-sgf-primaria uppercase">Cenário {i + 1}</p>
            <p className="font-display text-sm font-bold text-slate-900">{c.titulo}</p>
            <p className="mt-1 text-xs text-slate-600">{c.descricao}</p>
            <p className="mt-1.5 flex-1 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Esperado:</span> {c.esperado}
            </p>
            <Botao variante="secundaria" className="mt-2 self-start px-2.5 py-1 text-xs" icone={<Play className="size-3.5" />} onClick={c.aplicar}>
              Preparar cenário
            </Botao>
          </li>
        ))}
      </ol>

      <div className="rounded-xl bg-sgf-escuro p-4 text-slate-200">
        <p className="text-[10px] font-bold tracking-wider text-sgf-destaque uppercase">Diagrama de Sequência implementado</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
          {PARTICIPANTES.map((p, i) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="rounded-md bg-slate-800 px-2 py-1 font-semibold ring-1 ring-slate-700">{p}</span>
              {i < PARTICIPANTES.length - 1 && <ArrowRight className="size-3.5 text-slate-500" aria-hidden />}
            </span>
          ))}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-slate-400">
          <span className="font-mono text-slate-300">alt</span> [colaborador/obra inexistente ou interjornada &lt; 11h] → aborta antes do INSERT
          (404/422). <span className="font-mono text-slate-300">else</span> → INSERT imutável em REGISTO_PONTO e comprovante com horas acumuladas.
        </p>
      </div>
    </aside>
  );
}
