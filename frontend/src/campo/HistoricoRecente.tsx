import { useLiveQuery } from 'dexie-react-hooks';
import { History, Trash2 } from 'lucide-react';
import { Botao, SeloStatus, Vazio } from '../componentes/ui';
import { dbLocal } from '../lib/dbLocal';
import { formatarDataHora, formatarHora } from '../lib/tempo';
import { rotuloTipo } from '../lib/tipos';

/** Histórico recente do dispositivo (IndexedDB) — inclui pendentes e conflitos, sem perda silenciosa. */
export default function HistoricoRecente() {
  const batidas = useLiveQuery(() => dbLocal.batidas.orderBy('criado_em').reverse().limit(25).toArray(), [], []);

  async function limparSincronizados() {
    await dbLocal.batidas.where('status').equals('SINCRONIZADO').delete();
  }

  return (
    <section aria-labelledby="titulo-historico">
      <div className="mb-2 flex items-center justify-between">
        <h2 id="titulo-historico" className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
          <History className="size-4 text-sgf-primaria" aria-hidden /> Histórico recente (dispositivo)
        </h2>
        {batidas.some((b) => b.status === 'SINCRONIZADO') && (
          <Botao variante="fantasma" className="px-2 py-1 text-[11px]" icone={<Trash2 className="size-3.5" />} onClick={limparSincronizados}>
            Limpar sincronizados
          </Botao>
        )}
      </div>

      {batidas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white">
          <Vazio>Nenhuma batida registrada neste dispositivo.</Vazio>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {batidas.map((b) => (
            <li key={b.id_local} className="px-3 py-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    <span className="num font-mono text-sgf-primaria">{formatarHora(b.data_hora_batida)}</span> · {b.nome_colaborador ?? `Matrícula ${b.matricula}`}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {rotuloTipo(b.tipo_batida)} · {b.nome_obra ?? `Obra ${b.id_obra}`} · {b.confianca_facial.toFixed(2)}%
                    {b.id_registo ? ` · #${b.id_registo}` : ''}
                  </p>
                </div>
                <SeloStatus status={b.status} />
              </div>
              {(b.status === 'CONFLITO' || b.status === 'REJEITADO') && b.erro && (
                <p className="mt-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-900 ring-1 ring-amber-200">
                  <strong>Motivo:</strong> {b.erro}
                  {b.detalhes ? ` — ${b.detalhes}` : ''}
                </p>
              )}
              {b.sincronizado_offline && b.status !== 'REJEITADO' && (
                <p className="mt-1 text-[10px] text-slate-400">
                  capturado offline em {formatarDataHora(b.data_hora_batida)}
                  {b.sincronizado_em ? ` · sincronizado em ${formatarDataHora(b.sincronizado_em)}` : ' · aguardando conexão'}
                  {b.tempo_gravacao_ms !== undefined ? ` · fila em ${b.tempo_gravacao_ms} ms` : ''}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
