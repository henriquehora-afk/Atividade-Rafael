import { ChevronDown, ChevronRight, CloudOff, Database, FileCheck2, Lock, ShieldCheck } from 'lucide-react';
import { Fragment, useCallback, useEffect, useState } from 'react';
import { Botao, Cartao, cx, Etiqueta, Vazio } from '../componentes/ui';
import { api, ErroApi } from '../lib/api';
import { formatarData, formatarDataHora, formatarDuracao, formatarHora, hojeLocal, somarDias } from '../lib/tempo';
import { rotuloTipo, type BatidaDetalhada, type Colaborador, type LinhaEspelho, type SituacaoJornada } from '../lib/tipos';
import ModalJustificativa from './ModalJustificativa';

const SITUACOES: Record<SituacaoJornada, { rotulo: string; cor: 'emerald' | 'sky' | 'amber' | 'red' | 'violet' }> = {
  CONFORME: { rotulo: 'Conforme', cor: 'emerald' },
  EM_ANDAMENTO: { rotulo: 'Em andamento', cor: 'sky' },
  HORA_EXTRA: { rotulo: 'Hora extra', cor: 'violet' },
  DEBITO: { rotulo: 'Débito', cor: 'amber' },
  INCOMPLETA: { rotulo: 'Marcação incompleta', cor: 'red' },
};

export default function EspelhoAuditoria({ versao, aoAlterar }: { versao: number; aoAlterar: () => void }) {
  const [inicio, setInicio] = useState(() => somarDias(hojeLocal(), -6));
  const [fim, setFim] = useState(() => hojeLocal());
  const [idColaborador, setIdColaborador] = useState<number | ''>('');
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [linhas, setLinhas] = useState<LinhaEspelho[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const [alvo, setAlvo] = useState<BatidaDetalhada | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'trigger'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      setLinhas(await api.espelho({ inicio, fim, id_colaborador: idColaborador || undefined }));
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, [inicio, fim, idColaborador]);

  useEffect(() => {
    void carregar();
    const id = window.setInterval(() => void carregar(), 10000);
    return () => window.clearInterval(id);
  }, [carregar, versao]);

  useEffect(() => {
    api.listarColaboradores().then(setColaboradores).catch(() => undefined);
  }, [versao]);

  const chave = (l: LinhaEspelho) => `${l.id_colaborador}|${l.data_jornada}`;
  const alternar = (k: string) =>
    setAbertas((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  async function testarImutabilidade(b: BatidaDetalhada) {
    try {
      await api.tentarAlterarBatida(b.id_registo);
      setAviso({ tipo: 'trigger', texto: 'Atenção: o SGBD aceitou a alteração — trigger ausente!' });
    } catch (e) {
      setAviso({
        tipo: 'ok',
        texto:
          e instanceof ErroApi
            ? `UPDATE em REGISTO_PONTO #${b.id_registo} bloqueado pelo SGBD (HTTP ${e.status}): "${e.erro}".`
            : String(e),
      });
    }
  }

  return (
    <Cartao>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
        <label>
          <span className="rotulo">De</span>
          <input type="date" className="campo num" value={inicio} max={fim} onChange={(e) => setInicio(e.target.value)} />
        </label>
        <label>
          <span className="rotulo">Até</span>
          <input type="date" className="campo num" value={fim} min={inicio} onChange={(e) => setFim(e.target.value)} />
        </label>
        <label className="min-w-56">
          <span className="rotulo">Colaborador</span>
          <select className="campo" value={idColaborador} onChange={(e) => setIdColaborador(e.target.value ? Number(e.target.value) : '')}>
            <option value="">Todos</option>
            {colaboradores.map((c) => (
              <option key={c.id_colaborador} value={c.id_colaborador}>
                {c.nome_completo} · {c.matricula}
              </option>
            ))}
          </select>
        </label>
        <span className="ml-auto flex items-center gap-1 font-mono text-[11px] text-slate-500">
          <Database className="size-3.5" aria-hidden /> vw_espelho_ponto_diario {carregando && '· atualizando…'}
        </span>
      </div>

      {aviso && (
        <div
          className={cx(
            'flex items-start justify-between gap-3 border-b px-4 py-2.5 text-sm',
            aviso.tipo === 'ok' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-800',
          )}
        >
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden /> {aviso.texto}
          </span>
          <button type="button" className="text-xs font-semibold underline" onClick={() => setAviso(null)}>
            fechar
          </button>
        </div>
      )}
      {erro && <p className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{erro}</p>}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-[11px] tracking-wide text-slate-500 uppercase">
            <tr>
              <th className="w-8 px-3 py-2" />
              <th className="px-3 py-2">Data</th>
              <th className="px-3 py-2">Colaborador</th>
              <th className="px-3 py-2">Marcações</th>
              <th className="px-3 py-2 text-right">Horas trab.</th>
              <th className="px-3 py-2 text-right">Carga</th>
              <th className="px-3 py-2 text-right">Saldo</th>
              <th className="px-3 py-2">Situação</th>
              <th className="px-3 py-2">Auditoria</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {linhas.length === 0 && (
              <tr>
                <td colSpan={9}>
                  <Vazio>{carregando ? 'Carregando espelho…' : 'Nenhuma batida no período selecionado.'}</Vazio>
                </td>
              </tr>
            )}
            {linhas.map((l) => {
              const k = chave(l);
              const aberta = abertas.has(k);
              const sit = SITUACOES[l.situacao_jornada];
              return (
                <Fragment key={k}>
                  <tr className={cx('cursor-pointer hover:bg-slate-50', aberta && 'bg-sky-50/50')} onClick={() => alternar(k)}>
                    <td className="px-3 py-2 text-slate-400">{aberta ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</td>
                    <td className="num px-3 py-2 font-mono text-xs whitespace-nowrap">{formatarData(l.data_jornada)}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-slate-900">{l.nome_completo}</p>
                      <p className="text-xs text-slate-500">
                        {l.matricula} · {l.funcao} · {l.descricao_turno}
                      </p>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {l.batidas.map((b) => (
                          <span
                            key={b.id_registo}
                            title={`${rotuloTipo(b.tipo_batida)}${b.sincronizado_offline ? ' · sincronizado offline' : ''}`}
                            className={cx(
                              'num rounded px-1.5 py-0.5 font-mono text-[11px] ring-1',
                              b.sincronizado_offline ? 'bg-red-50 text-red-700 ring-red-200' : 'bg-slate-100 text-slate-700 ring-slate-200',
                              b.justificativa && 'outline-2 outline-offset-1 outline-violet-400',
                            )}
                          >
                            {formatarHora(b.data_hora_batida)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="num px-3 py-2 text-right font-mono font-bold">{l.horas_trabalhadas}</td>
                    <td className="num px-3 py-2 text-right font-mono text-slate-500">{l.carga_horaria_horas}</td>
                    <td className={cx('num px-3 py-2 text-right font-mono', l.saldo_minutos < 0 ? 'text-amber-700' : 'text-emerald-700')}>
                      {l.saldo_minutos > 0 ? '+' : ''}
                      {formatarDuracao(l.saldo_minutos)}
                    </td>
                    <td className="px-3 py-2">
                      <Etiqueta cor={sit.cor}>{sit.rotulo}</Etiqueta>
                    </td>
                    <td className="px-3 py-2">
                      {l.possui_ajuste ? (
                        <Etiqueta cor="violet">
                          <FileCheck2 className="size-3" /> {l.qtd_ajustes} ajuste{l.qtd_ajustes > 1 ? 's' : ''}
                        </Etiqueta>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                  {aberta && (
                    <tr className="bg-slate-50/70">
                      <td />
                      <td colSpan={8} className="px-3 pt-1 pb-4">
                        <ul className="space-y-2">
                          {l.batidas.map((b) => (
                            <li key={b.id_registo} className="rounded-lg border border-slate-200 bg-white p-3">
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                                <span className="num font-mono text-sm font-bold text-sgf-escuro">{formatarDataHora(b.data_hora_batida)}</span>
                                <Etiqueta cor="sky">{rotuloTipo(b.tipo_batida)}</Etiqueta>
                                <span className="text-xs text-slate-600">
                                  {b.codigo_obra} · {b.nome_canteiro}
                                </span>
                                <span className="num font-mono text-xs text-slate-500">facial {b.confianca_facial.toFixed(2)}%</span>
                                {b.sincronizado_offline ? (
                                  <Etiqueta cor="red">
                                    <CloudOff className="size-3" /> sincronizado offline
                                  </Etiqueta>
                                ) : (
                                  <Etiqueta>online</Etiqueta>
                                )}
                                <span className="flex items-center gap-1 font-mono text-[11px] text-slate-400">
                                  <Lock className="size-3" /> #{b.id_registo} imutável
                                </span>
                                <div className="ml-auto flex gap-2">
                                  <Botao
                                    variante="fantasma"
                                    className="px-2 py-1 text-[11px]"
                                    icone={<Lock className="size-3.5" />}
                                    title="Tenta um UPDATE direto: o trigger do SGBD deve bloquear"
                                    onClick={() => void testarImutabilidade(b)}
                                  >
                                    Testar imutabilidade
                                  </Botao>
                                  {!b.justificativa && (
                                    <Botao className="px-2.5 py-1 text-xs" icone={<FileCheck2 className="size-3.5" />} onClick={() => setAlvo(b)}>
                                      Registrar Justificativa de Ajuste
                                    </Botao>
                                  )}
                                </div>
                              </div>
                              {b.justificativa && (
                                <div className="mt-2 rounded-md bg-violet-50 px-3 py-2 text-xs text-violet-950 ring-1 ring-violet-200">
                                  <p className="font-semibold">
                                    Justificativa #{b.justificativa.id_ajuste} · {b.justificativa.responsavel_rh} ·{' '}
                                    <span className="num font-mono">{formatarDataHora(b.justificativa.data_hora_registro)}</span>
                                  </p>
                                  <p className="mt-0.5">{b.justificativa.motivo_ajuste}</p>
                                </div>
                              )}
                            </li>
                          ))}
                        </ul>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {alvo && (
        <ModalJustificativa
          batida={alvo}
          aoFechar={() => setAlvo(null)}
          aoSalvar={() => {
            setAviso({ tipo: 'ok', texto: `Justificativa registrada para a batida #${alvo.id_registo}. A batida original permanece inalterada.` });
            setAlvo(null);
            aoAlterar();
          }}
        />
      )}
    </Cartao>
  );
}
