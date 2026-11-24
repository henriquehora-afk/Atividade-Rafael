import { useLiveQuery } from 'dexie-react-hooks';
import { Building2, Clock, CloudUpload, Plane, ScanFace, SlidersHorizontal, UserRound, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Botao, cx, Etiqueta } from '../componentes/ui';
import { useConectividade } from '../hooks/useConectividade';
import { ErroRede } from '../lib/api';
import { dbLocal } from '../lib/dbLocal';
import { capturarFrameSha256, reconhecer } from '../lib/reconhecimentoFacial';
import { avaliarInterjornada, CONFIANCA_FACIAL_MINIMA, INTERJORNADA_MINIMA_MIN } from '../lib/regrasCLT';
import { atualizarCacheCadastros, registarPonto, ultimaSaidaConhecida } from '../lib/servicoCampo';
import { sincronizarPendentes } from '../lib/sincronizacao';
import { agoraLocal, deDatetimeLocal, formatarDataHora, formatarDuracao, paraDatetimeLocal, somarMinutos } from '../lib/tempo';
import { TIPOS_BATIDA, type Colaborador, type Obra, type TipoBatida } from '../lib/tipos';
import CameraFacial from './CameraFacial';
import HistoricoRecente from './HistoricoRecente';
import ResultadoBatida, { type ResultadoExibido } from './ResultadoBatida';
import RoteiroDemo, { type Cenario } from './RoteiroDemo';

const CHAVE_OBRA = 'sgf:obra';

function Interruptor({ ativo, aoAlternar, rotulo }: { ativo: boolean; aoAlternar: (v: boolean) => void; rotulo: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ativo}
      onClick={() => aoAlternar(!ativo)}
      className="flex items-center gap-2 text-left"
    >
      <span className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', ativo ? 'bg-red-600' : 'bg-slate-300')}>
        <span className={cx('absolute top-0.5 left-0.5 grid size-5 place-items-center rounded-full bg-white shadow transition-transform', ativo && 'translate-x-5')}>
          <Plane className={cx('size-3', ativo ? 'text-red-600' : 'text-slate-400')} aria-hidden />
        </span>
      </span>
      <span className="text-xs leading-tight font-semibold text-slate-700">{rotulo}</span>
    </button>
  );
}

export default function ModoCampo() {
  const con = useConectividade();
  const obras = useLiveQuery(() => dbLocal.obras.toArray(), [], [] as Obra[]);
  const colaboradores = useLiveQuery(
    async () => (await dbLocal.colaboradores.toArray()).sort((a, b) => a.nome_completo.localeCompare(b.nome_completo)),
    [],
    [] as Colaborador[],
  );
  const pendentes = useLiveQuery(() => dbLocal.batidas.where('status').equals('PENDENTE').count(), [], 0);

  const [relogio, setRelogio] = useState(() => agoraLocal());
  const [idObra, setIdObra] = useState(() => Number(localStorage.getItem(CHAVE_OBRA)) || 10);
  const [identificacao, setIdentificacao] = useState<'lista' | 'manual'>('lista');
  const [matriculaLista, setMatriculaLista] = useState('1024');
  const [matriculaManual, setMatriculaManual] = useState('99999');
  const [tipo, setTipo] = useState<TipoBatida>('ENTRADA');
  const [horarioManual, setHorarioManual] = useState(false);
  const [dataHoraManual, setDataHoraManual] = useState(() => paraDatetimeLocal(agoraLocal()));
  const [confianca, setConfianca] = useState(96.8);
  const [divergente, setDivergente] = useState(false);
  const [cameraAtiva, setCameraAtiva] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoExibido | null>(null);
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [estadoSync, setEstadoSync] = useState<{ sincronizando: boolean; mensagem?: string; erro?: boolean }>({ sincronizando: false });
  const [estadoCache, setEstadoCache] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const id = window.setInterval(() => setRelogio(agoraLocal()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    localStorage.setItem(CHAVE_OBRA, String(idObra));
  }, [idObra]);

  const matricula = identificacao === 'lista' ? matriculaLista : matriculaManual.trim();
  const colaborador = colaboradores.find((c) => c.matricula === matricula) ?? null;
  const dataHoraCaptura = horarioManual ? (deDatetimeLocal(dataHoraManual) ?? relogio) : relogio;
  const ultimaSaida = useLiveQuery(
    () => (matricula ? ultimaSaidaConhecida(matricula, dataHoraCaptura) : Promise.resolve(null)),
    [matricula, dataHoraCaptura],
    null,
  );
  const interjornada = tipo === 'ENTRADA' && colaborador ? avaliarInterjornada(ultimaSaida, dataHoraCaptura) : null;

  // Cache de cadastros mestres para validação offline — atualizado sempre que há conexão.
  useEffect(() => {
    if (!con.online) return;
    atualizarCacheCadastros()
      .then((r) => setEstadoCache(`Cache offline atualizado: ${r.colaboradores} colaboradores, ${r.obras} obra(s).`))
      .catch(() => undefined);
  }, [con.online]);

  const sincronizar = useCallback(
    async (origem: 'auto' | 'manual') => {
      setEstadoSync({ sincronizando: true });
      try {
        const r = await sincronizarPendentes();
        setEstadoSync({
          sincronizando: false,
          mensagem: r.enviados
            ? `${origem === 'auto' ? 'Sincronização automática' : 'Sincronização'}: ${r.enviados} enviada(s) em ordem cronológica — ${r.sincronizados} sincronizada(s), ${r.conflitos} em conflito.`
            : 'Nenhuma batida pendente.',
        });
        if (r.sincronizados) atualizarCacheCadastros().catch(() => undefined);
      } catch (e) {
        if (e instanceof ErroRede) con.marcarFalhaRede();
        setEstadoSync({ sincronizando: false, erro: true, mensagem: `Falha ao sincronizar: ${e instanceof Error ? e.message : String(e)}. Itens continuam pendentes.` });
      }
    },
    [con.marcarFalhaRede],
  );

  // Ao voltar online (ou surgir pendência com conexão), sincroniza automaticamente.
  useEffect(() => {
    if (con.online && pendentes > 0) void sincronizar('auto');
  }, [con.online, pendentes, sincronizar]);

  // Nova tentativa periódica enquanto houver pendências.
  useEffect(() => {
    if (!con.online || pendentes === 0) return;
    const id = window.setInterval(() => void sincronizar('auto'), 20000);
    return () => window.clearInterval(id);
  }, [con.online, pendentes, sincronizar]);

  async function registrar() {
    if (!matricula) return;
    setProcessando(true);
    setResultado(null);
    setErroGeral(null);
    try {
      const dataHora = horarioManual ? deDatetimeLocal(dataHoraManual) : agoraLocal();
      if (!dataHora) throw new Error('Horário manual inválido.');
      const frame = cameraAtiva && videoRef.current ? await capturarFrameSha256(videoRef.current) : null;
      await new Promise((r) => setTimeout(r, 300)); // animação de varredura facial
      const rec = reconhecer({ matricula, colaboradores, confiancaSimulada: confianca, simularDivergencia: divergente, frameSha256: frame });
      // 1. registarPonto(matricula, foto_hash, data_hora, id_obra, tipo_batida, confianca_facial, sincronizado_offline)
      const r = await registarPonto(
        { matricula, foto_hash: rec.foto_hash, data_hora_batida: dataHora, id_obra: idObra, tipo_batida: tipo, confianca_facial: rec.confianca_facial },
        { online: con.online, aoFalharRede: con.marcarFalhaRede },
      );
      setResultado({ ...r, reconhecimento: rec });
    } catch (e) {
      setErroGeral(e instanceof Error ? e.message : String(e));
    } finally {
      setProcessando(false);
    }
  }

  // ---------------------------------------------------------------- Cenários de demonstração
  const marcos = colaboradores.find((c) => c.matricula === '2048');
  function horarioViolacaoMarcos(): { manual: boolean; valor: string } {
    const saida = marcos?.ultima_saida;
    if (saida && agoraLocal() >= somarMinutos(saida, INTERJORNADA_MINIMA_MIN)) {
      // datetime-local não tem segundos: arredonda para o minuto seguinte mantendo 10h59 ≤ intervalo < 11h00
      const base = somarMinutos(saida, INTERJORNADA_MINIMA_MIN - 1);
      const truncado = `${base.slice(0, 16)}:00`;
      return { manual: true, valor: paraDatetimeLocal(truncado < base ? somarMinutos(truncado, 1) : truncado) };
    }
    return { manual: false, valor: paraDatetimeLocal(agoraLocal()) };
  }

  const preparar = (p: { matricula?: string; manual?: string; tipo?: TipoBatida; confianca?: number; horario?: { manual: boolean; valor: string }; aviao?: boolean }) => {
    if (p.matricula) {
      setIdentificacao('lista');
      setMatriculaLista(p.matricula);
    }
    if (p.manual) {
      setIdentificacao('manual');
      setMatriculaManual(p.manual);
    }
    setTipo(p.tipo ?? 'ENTRADA');
    setConfianca(p.confianca ?? 96.8);
    setDivergente(false);
    const h = p.horario ?? { manual: false, valor: paraDatetimeLocal(agoraLocal()) };
    setHorarioManual(h.manual);
    setDataHoraManual(h.valor);
    if (p.aviao !== undefined) con.definirModoAviao(p.aviao);
    if (obras.some((o) => o.id_obra === 10)) setIdObra(10);
    setResultado(null);
  };

  const cenarios: Cenario[] = [
    {
      id: 'ct02',
      titulo: 'CT02 · Batida facial válida',
      descricao: 'Carlos Souza (1024), ENTRADA agora na Arena MRV — última saída há mais de 11h.',
      esperado: 'Comprovante + selo "Ponto Sincronizado"; presentes +1 no Dashboard.',
      aplicar: () => preparar({ matricula: '1024', aviao: false }),
    },
    {
      id: 'clt',
      titulo: 'Violação Interjornada (Art. 66)',
      descricao: horarioViolacaoMarcos().manual
        ? 'Marcos Silva (2048), ENTRADA 10h59 após a última SAIDA (horário manual — o seed já passou de 11h).'
        : 'Marcos Silva (2048), ENTRADA agora — última SAIDA há menos de 11h.',
      esperado: 'Bloqueio antes do INSERT: "Matricula invalida ou violacao Interjornada < 11h".',
      aplicar: () => preparar({ matricula: '2048', horario: horarioViolacaoMarcos(), aviao: false }),
    },
    {
      id: 'ct01',
      titulo: 'CT01 · Matrícula inexistente',
      descricao: 'Digitação manual da matrícula 99999 na obra 10.',
      esperado: 'HTTP 404 — nenhuma ocorrência gravada (integridade referencial).',
      aplicar: () => preparar({ manual: '99999', aviao: false }),
    },
    {
      id: 'bio',
      titulo: 'Biometria abaixo de 85%',
      descricao: 'Carlos Souza com confiança facial simulada de 72,50%.',
      esperado: 'Reconhecimento facial reprovado (mínimo 85.00).',
      aplicar: () => preparar({ matricula: '1024', confianca: 72.5, tipo: 'SAIDA_ALMOCO', aviao: false }),
    },
    {
      id: 'offline',
      titulo: 'Offline → Sincronização',
      descricao: 'Liga o Modo Avião. Registre uma batida do Carlos, aguarde e desligue o Modo Avião.',
      esperado: 'Badge "Offline / Pendente" → "Ponto Sincronizado" com o horário ORIGINAL da captura.',
      aplicar: () => preparar({ matricula: '1024', tipo: 'SAIDA_ALMOCO', aviao: true }),
    },
    {
      id: 'conflito',
      titulo: 'Conflito na sincronização',
      descricao: 'Modo Avião + ENTRADA do Marcos: offline a interjornada é só aviso.',
      esperado: 'Ao reconectar o servidor rejeita → "Conflito / Rejeitado" com motivo visível.',
      aplicar: () => preparar({ matricula: '2048', horario: horarioViolacaoMarcos(), aviao: true }),
    },
  ];

  const motivoOffline = con.modoAviao
    ? 'Modo Avião (simulado)'
    : !con.navegadorOnline
      ? 'Sem rede no dispositivo'
      : con.servidorAlcancavel === false
        ? 'Servidor inalcançável'
        : 'Verificando conexão…';

  return (
    <div className="mx-auto max-w-6xl px-0 py-0 sm:px-4 sm:py-8 lg:grid lg:grid-cols-[28rem_minmax(0,1fr)] lg:items-start lg:gap-8">
      {/* ------------------------------------------------------------------ Dispositivo do Fiscal */}
      <div className="sm:mx-auto sm:max-w-md sm:rounded-[2.3rem] sm:bg-sgf-escuro sm:p-2.5 sm:shadow-2xl sm:shadow-slate-900/30 lg:mx-0">
        <div className="overflow-hidden bg-sgf-fundo sm:rounded-[1.9rem]">
          {/* Cabeçalho do app */}
          <div className="bg-gradient-to-br from-sgf-escuro via-slate-900 to-sky-950 px-4 pt-4 pb-3 text-white">
            <div className="flex items-center justify-between">
              <p className="font-display text-base font-bold">Ponto Facial · Fiscal de Obra</p>
              <span className="num flex items-center gap-1 font-mono text-xs text-sgf-destaque">
                <Clock className="size-3.5" aria-hidden /> {relogio.slice(11)}
              </span>
            </div>
            <label className="mt-3 block">
              <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wider text-slate-400 uppercase">
                <Building2 className="size-3" aria-hidden /> Canteiro de obra
              </span>
              <select
                value={idObra}
                onChange={(e) => setIdObra(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white focus:border-sgf-destaque focus:outline-none"
              >
                {obras.length === 0 && <option value={idObra}>Obra {idObra} (cache vazio)</option>}
                {obras.map((o) => (
                  <option key={o.id_obra} value={o.id_obra}>
                    {o.codigo_obra} · {o.nome_canteiro} — {o.localidade}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Barra de status Online/Offline */}
          <div className={cx('border-b px-4 py-3', con.online ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50')}>
            <div className="flex items-center justify-between gap-2">
              <span
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold',
                  con.online ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white',
                )}
              >
                {con.online ? <Wifi className="size-3.5" aria-hidden /> : <WifiOff className="size-3.5" aria-hidden />}
                {con.online ? 'Online' : 'Offline'}
              </span>
              <span className="truncate text-[11px] text-slate-600">{con.online ? 'API e SGBD alcançáveis' : motivoOffline}</span>
              <span
                className={cx(
                  'inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-bold',
                  pendentes > 0 ? 'bg-red-100 text-red-700 ring-1 ring-red-300' : 'bg-slate-100 text-slate-500',
                )}
                title="Batidas na fila local aguardando sincronização"
              >
                <span className="num">{pendentes}</span> pendente{pendentes === 1 ? '' : 's'}
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <Interruptor ativo={con.modoAviao} aoAlternar={con.definirModoAviao} rotulo="Simular Modo Avião (Offline)" />
              <Botao
                variante={pendentes > 0 ? 'primaria' : 'secundaria'}
                className="shrink-0 px-3 py-1.5 text-xs"
                carregando={estadoSync.sincronizando}
                disabled={!con.online || pendentes === 0}
                icone={<CloudUpload className="size-4" />}
                onClick={() => void sincronizar('manual')}
              >
                Sincronizar Pendentes
              </Botao>
            </div>
            {estadoSync.mensagem && (
              <p className={cx('mt-2 text-[11px]', estadoSync.erro ? 'text-red-700' : 'text-slate-600')}>{estadoSync.mensagem}</p>
            )}
          </div>

          <div className="space-y-4 p-4">
            <CameraFacial
              videoRef={videoRef}
              aoMudar={setCameraAtiva}
              escaneando={processando}
              rotuloAlvo={colaborador ? `${colaborador.nome_completo} · ${colaborador.matricula}` : matricula ? `Matrícula ${matricula}` : null}
            />

            {/* Simular Captura Facial */}
            <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-labelledby="titulo-captura">
              <h2 id="titulo-captura" className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-800">
                <UserRound className="size-4 text-sgf-primaria" aria-hidden /> Identificação do operário
              </h2>
              <div className="mb-2 grid grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
                {(
                  [
                    ['lista', 'Colaborador cadastrado'],
                    ['manual', 'Digitar matrícula'],
                  ] as const
                ).map(([id, rotulo]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setIdentificacao(id)}
                    className={cx('rounded-md px-2 py-1.5 transition', identificacao === id ? 'bg-white text-sgf-primaria shadow-sm' : 'text-slate-500 hover:text-slate-700')}
                  >
                    {rotulo}
                  </button>
                ))}
              </div>

              {identificacao === 'lista' ? (
                <select aria-label="Colaborador" className="campo" value={matriculaLista} onChange={(e) => setMatriculaLista(e.target.value)}>
                  {colaboradores.length === 0 && <option value="">Cache vazio — conecte-se uma vez</option>}
                  {colaboradores.map((c) => (
                    <option key={c.matricula} value={c.matricula}>
                      {c.nome_completo} · {c.matricula} · {c.funcao}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label="Matrícula"
                  className="campo num font-mono"
                  inputMode="numeric"
                  placeholder="Ex.: 99999"
                  value={matriculaManual}
                  onChange={(e) => setMatriculaManual(e.target.value)}
                />
              )}

              {matricula && (
                <div className="mt-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs ring-1 ring-slate-200">
                  {colaborador ? (
                    <>
                      <p className="font-semibold text-slate-800">
                        {colaborador.nome_completo} <span className="font-normal text-slate-500">· {colaborador.funcao} · {colaborador.descricao_turno}</span>
                      </p>
                      <p className="mt-0.5 text-slate-500">
                        Última SAIDA conhecida: <span className="num font-mono text-slate-700">{formatarDataHora(ultimaSaida)}</span>
                      </p>
                      {interjornada && interjornada.intervaloMinutos !== null && (
                        <p className={cx('mt-1 font-semibold', interjornada.conforme ? 'text-emerald-700' : 'text-red-700')}>
                          Interjornada {formatarDuracao(interjornada.intervaloMinutos)}{' '}
                          {interjornada.conforme ? '≥ 11h00 — conforme Art. 66' : `< 11h00 — faltam ${interjornada.faltamMinutos} min`}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="font-semibold text-amber-700">Matrícula {matricula} não consta no cache local de cadastros.</p>
                  )}
                </div>
              )}

              <p className="rotulo mt-3">Tipo de batida</p>
              <div className="grid grid-cols-2 gap-1.5">
                {TIPOS_BATIDA.map((t) => (
                  <button
                    key={t.valor}
                    type="button"
                    aria-pressed={tipo === t.valor}
                    onClick={() => setTipo(t.valor)}
                    className={cx(
                      'rounded-lg px-2 py-2 text-xs font-semibold ring-1 transition',
                      tipo === t.valor ? 'bg-sgf-escuro text-white ring-sgf-escuro' : 'bg-white text-slate-700 ring-slate-300 hover:ring-sgf-primaria',
                    )}
                  >
                    {t.rotulo}
                  </button>
                ))}
              </div>

              <p className="rotulo mt-3">Horário da captura</p>
              <div className="flex items-center gap-2">
                <div className="grid shrink-0 grid-cols-2 gap-1 rounded-lg bg-slate-100 p-1 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setHorarioManual(false)}
                    className={cx('rounded-md px-2 py-1', !horarioManual ? 'bg-white text-sgf-primaria shadow-sm' : 'text-slate-500')}
                  >
                    Agora
                  </button>
                  <button
                    type="button"
                    onClick={() => setHorarioManual(true)}
                    className={cx('rounded-md px-2 py-1', horarioManual ? 'bg-white text-sgf-primaria shadow-sm' : 'text-slate-500')}
                  >
                    Manual
                  </button>
                </div>
                {horarioManual ? (
                  <input
                    type="datetime-local"
                    aria-label="Data e hora manual"
                    className="campo num py-1.5"
                    value={dataHoraManual}
                    onChange={(e) => setDataHoraManual(e.target.value)}
                  />
                ) : (
                  <span className="num font-mono text-sm text-slate-700">{formatarDataHora(relogio)}</span>
                )}
              </div>

              <details className="group mt-3 rounded-lg bg-slate-50 ring-1 ring-slate-200">
                <summary className="flex cursor-pointer items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-slate-600 select-none">
                  <SlidersHorizontal className="size-3.5" aria-hidden /> Parâmetros da simulação biométrica
                  <Etiqueta cor={confianca >= CONFIANCA_FACIAL_MINIMA ? 'emerald' : 'red'} className="ml-auto">
                    {confianca.toFixed(2)}%
                  </Etiqueta>
                </summary>
                <div className="space-y-2 px-2.5 pb-2.5">
                  <label className="block">
                    <span className="text-[11px] text-slate-500">Confiança facial devolvida pela API (mínimo {CONFIANCA_FACIAL_MINIMA.toFixed(2)})</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={0}
                        max={100}
                        step={0.1}
                        value={confianca}
                        onChange={(e) => setConfianca(Number(e.target.value))}
                        className="w-full accent-sgf-primaria"
                      />
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.01}
                        value={confianca}
                        onChange={(e) => setConfianca(Number(e.target.value))}
                        className="campo num w-20 px-2 py-1 font-mono text-xs"
                        aria-label="Confiança facial"
                      />
                    </div>
                  </label>
                  <label className="flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" checked={divergente} onChange={(e) => setDivergente(e.target.checked)} className="accent-red-600" />
                    Rosto não confere com o template (foto_hash divergente)
                  </label>
                </div>
              </details>
            </section>

            <Botao
              className="w-full py-3.5 text-base"
              carregando={processando}
              disabled={!matricula}
              icone={<ScanFace className="size-5" />}
              onClick={() => void registrar()}
            >
              {processando ? 'Reconhecendo rosto…' : 'Simular Captura Facial e Registrar'}
            </Botao>
            <p className="-mt-2 text-center text-[11px] text-slate-500">
              {con.online ? 'Online: envio direto ao ServicoJornada' : 'Offline: validação no cache local + fila IndexedDB'}
            </p>

            {erroGeral && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erroGeral}</p>}
            {resultado && <ResultadoBatida resultado={resultado} />}

            <HistoricoRecente />
            {estadoCache && <p className="text-center text-[10px] text-slate-400">{estadoCache}</p>}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ Roteiro de aula */}
      <RoteiroDemo cenarios={cenarios} />
    </div>
  );
}
