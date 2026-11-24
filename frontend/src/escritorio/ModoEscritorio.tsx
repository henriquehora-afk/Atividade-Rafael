import { CloudUpload, Database, FileCheck2, HardHat, ListChecks, RefreshCw, TriangleAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Botao, Cartao, cx } from '../componentes/ui';
import { api } from '../lib/api';
import { formatarData, formatarDataHora } from '../lib/tempo';
import type { ResumoDashboard } from '../lib/tipos';
import CadastrosMestres from './CadastrosMestres';
import EspelhoAuditoria from './EspelhoAuditoria';

function Kpi({ rotulo, valor, legenda, icone, destaque }: { rotulo: string; valor: number | string; legenda: string; icone: ReactNode; destaque?: string }) {
  return (
    <Cartao className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{rotulo}</p>
          <p className="num mt-1 font-display text-3xl font-bold text-sgf-escuro">{valor}</p>
        </div>
        <span className={cx('grid size-10 place-items-center rounded-lg', destaque ?? 'bg-sky-100 text-sgf-primaria')}>{icone}</span>
      </div>
      <p className="mt-2 text-[11px] text-slate-500">{legenda}</p>
    </Cartao>
  );
}

export default function ModoEscritorio() {
  const [aba, setAba] = useState<'espelho' | 'cadastros'>('espelho');
  const [resumo, setResumo] = useState<ResumoDashboard | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [versao, setVersao] = useState(0);

  const carregar = useCallback(async () => {
    setAtualizando(true);
    try {
      setResumo(await api.resumoDashboard());
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAtualizando(false);
    }
  }, []);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), 5000);
    return () => window.clearInterval(id);
  }, [carregar]);

  const aoAlterar = () => {
    setVersao((v) => v + 1);
    void carregar();
  };

  const k = resumo?.kpis;

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-sgf-escuro">Dashboard do Gestor de RH</h1>
          <p className="text-sm text-slate-600">
            Monitoramento em tempo real · {resumo ? `referência ${formatarData(resumo.data_referencia)}, atualizado ${formatarDataHora(resumo.gerado_em)}` : 'carregando…'}
          </p>
        </div>
        <Botao variante="secundaria" carregando={atualizando} icone={<RefreshCw className="size-4" />} onClick={aoAlterar}>
          Atualizar
        </Botao>
      </div>

      {erro && (
        <p className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">
          <TriangleAlert className="size-4" aria-hidden /> API indisponível: {erro}. Verifique se o backend está rodando (npm run dev).
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          rotulo="Colaboradores Presentes"
          valor={k?.colaboradores_presentes ?? '—'}
          legenda="Última batida de hoje = ENTRADA ou VOLTA_ALMOCO"
          icone={<Users className="size-5" />}
          destaque="bg-emerald-100 text-emerald-700"
        />
        <Kpi rotulo="Batidas Hoje" valor={k?.batidas_hoje ?? '—'} legenda="Ocorrências em REGISTO_PONTO no dia" icone={<HardHat className="size-5" />} />
        <Kpi
          rotulo="Sincronizados Offline"
          valor={k?.sincronizados_offline ?? '—'}
          legenda={`Capturados sem rede hoje · ${k?.sincronizados_offline_total ?? 0} no total`}
          icone={<CloudUpload className="size-5" />}
          destaque="bg-red-100 text-red-700"
        />
        <Kpi
          rotulo="Ajustes Auditados"
          valor={k?.ajustes_auditados ?? '—'}
          legenda="Justificativas em JUSTIFICATIVA_AJUSTE (0:1)"
          icone={<FileCheck2 className="size-5" />}
          destaque="bg-violet-100 text-violet-700"
        />
      </div>

      <Cartao>
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-display text-sm font-bold text-slate-800">Presença por obra</h2>
          <span className="flex items-center gap-1 font-mono text-[11px] text-slate-500">
            <Database className="size-3.5" aria-hidden /> vw_resumo_presenca_obra
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2">Obra</th>
                <th className="px-4 py-2">Localidade</th>
                <th className="px-4 py-2 text-right">Presentes</th>
                <th className="px-4 py-2 text-right">Batidas hoje</th>
                <th className="px-4 py-2 text-right">Offline hoje</th>
                <th className="px-4 py-2 text-right">Total batidas</th>
                <th className="px-4 py-2 text-right">Ajustes</th>
              </tr>
            </thead>
            <tbody className="num divide-y divide-slate-100">
              {(resumo?.obras ?? []).map((o) => (
                <tr key={o.id_obra} className="hover:bg-slate-50">
                  <td className="px-4 py-2">
                    <span className="font-semibold text-slate-900">{o.nome_canteiro}</span>{' '}
                    <span className="font-mono text-xs text-slate-500">{o.codigo_obra} · id {o.id_obra}</span>
                  </td>
                  <td className="px-4 py-2 text-slate-600">{o.localidade}</td>
                  <td className="px-4 py-2 text-right font-bold text-emerald-700">{o.colaboradores_presentes}</td>
                  <td className="px-4 py-2 text-right">{o.batidas_hoje}</td>
                  <td className="px-4 py-2 text-right text-red-700">{o.sincronizados_offline_hoje}</td>
                  <td className="px-4 py-2 text-right text-slate-600">{o.total_batidas}</td>
                  <td className="px-4 py-2 text-right text-violet-700">{o.total_ajustes_auditados}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Cartao>

      <div>
        <div role="tablist" className="mb-4 flex gap-1 border-b border-slate-200">
          {(
            [
              ['espelho', 'Espelho de Ponto & Auditoria', ListChecks],
              ['cadastros', 'Cadastros Mestres', Database],
            ] as const
          ).map(([id, rotulo, Icone]) => (
            <button
              key={id}
              role="tab"
              type="button"
              aria-selected={aba === id}
              onClick={() => setAba(id)}
              className={cx(
                '-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition',
                aba === id ? 'border-sgf-primaria text-sgf-primaria' : 'border-transparent text-slate-500 hover:text-slate-800',
              )}
            >
              <Icone className="size-4" aria-hidden /> {rotulo}
            </button>
          ))}
        </div>
        {aba === 'espelho' ? <EspelhoAuditoria versao={versao} aoAlterar={aoAlterar} /> : <CadastrosMestres aoAlterar={aoAlterar} />}
      </div>
    </div>
  );
}
