import { BadgeCheck, CloudOff, Lock, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { Etiqueta } from '../componentes/ui';
import type { ResultadoReconhecimento } from '../lib/reconhecimentoFacial';
import type { ResultadoCampo } from '../lib/servicoCampo';
import { formatarDataHora } from '../lib/tempo';
import { rotuloTipo } from '../lib/tipos';

export type ResultadoExibido = ResultadoCampo & { reconhecimento: ResultadoReconhecimento };

function Linha({ rotulo, valor, mono }: { rotulo: string; valor: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <dt className="text-xs text-slate-500">{rotulo}</dt>
      <dd className={`text-right text-sm font-medium text-slate-900 ${mono ? 'num font-mono text-xs' : ''}`}>{valor}</dd>
    </div>
  );
}

function Evidencia({ r }: { r: ResultadoReconhecimento }) {
  return (
    <p className="mt-2 border-t border-dashed border-slate-300/70 pt-2 font-mono text-[10px] leading-relaxed break-all text-slate-500">
      biometria: {r.origem === 'CAMERA' ? 'câmera real' : 'simulada'} · foto_hash={r.foto_hash}
      {r.frame_sha256 && <> · frame_sha256={r.frame_sha256.slice(0, 16)}…</>}
    </p>
  );
}

/** Feedback visual dos ramos do fragmento alt (6a / 8b) e do caminho offline. */
export default function ResultadoBatida({ resultado }: { resultado: ResultadoExibido }) {
  if (resultado.tipo === 'SINCRONIZADO') {
    const c = resultado.retorno.comprovante_ponto;
    return (
      <div role="status" className="overflow-hidden rounded-xl border border-emerald-300 bg-emerald-50">
        <div className="flex items-center gap-3 bg-emerald-600 px-4 py-3 text-white">
          <BadgeCheck className="size-8 shrink-0" aria-hidden />
          <div>
            <p className="font-display text-lg leading-tight font-bold">Ponto Sincronizado</p>
            <p className="text-xs text-emerald-50">
              Comprovante nº {c.id_registo}
              {resultado.retorno.duplicado && ' · reenvio idempotente (já registrado)'}
            </p>
          </div>
        </div>
        <dl className="divide-y divide-emerald-200/70 px-4 py-2">
          <Linha rotulo="Colaborador" valor={`${c.nome_completo} · ${c.matricula}`} />
          <Linha rotulo="Função" valor={c.funcao} />
          <Linha rotulo="Obra" valor={`${c.codigo_obra} · ${c.nome_canteiro}`} />
          <Linha rotulo="Batida" valor={rotuloTipo(c.tipo_batida)} />
          <Linha rotulo="Data/hora original" valor={formatarDataHora(c.data_hora_batida)} mono />
          <Linha rotulo="Confiança facial" valor={`${c.confianca_facial.toFixed(2)}%`} mono />
          <Linha rotulo="Horas acumuladas no dia" valor={`${resultado.retorno.horas_acumuladas} h`} mono />
        </dl>
        <div className="flex items-center gap-1.5 border-t border-emerald-200 bg-white/60 px-4 py-2 text-[11px] text-emerald-900">
          <Lock className="size-3.5" aria-hidden /> status_imutavel = true · Portaria MTP 671/2021 · emitido {formatarDataHora(c.emitido_em)}
        </div>
        <div className="px-4 pb-3">
          <Evidencia r={resultado.reconhecimento} />
        </div>
      </div>
    );
  }

  if (resultado.tipo === 'PENDENTE') {
    const b = resultado.batida;
    return (
      <div role="status" className="rounded-xl border border-red-300 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <CloudOff className="mt-0.5 size-7 shrink-0 text-red-600" aria-hidden />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-display text-base font-bold text-red-800">
              Offline / Pendente <Etiqueta cor="red">sincronizado_offline = true</Etiqueta>
            </p>
            <p className="mt-0.5 text-sm text-red-900/80">
              {b.nome_colaborador} · {rotuloTipo(b.tipo_batida)} gravado na fila local em{' '}
              <strong className="num">{resultado.tempoMs.toFixed(1)} ms</strong>. Horário original preservado:{' '}
              <strong className="num">{formatarDataHora(b.data_hora_batida)}</strong>.
            </p>
            {b.aviso && (
              <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1.5 text-xs text-amber-900">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {b.aviso}
              </p>
            )}
          </div>
        </div>
        <Evidencia r={resultado.reconhecimento} />
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-xl border-2 border-red-500 bg-white p-4 shadow-lg shadow-red-900/10">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-red-600 text-white">
          <ShieldAlert className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-bold tracking-wider text-red-600 uppercase">Batida rejeitada — nenhum registro gravado</p>
          <p className="font-display text-base leading-snug font-bold text-slate-900">{resultado.erro}</p>
          {resultado.detalhes && <p className="mt-1 text-sm text-slate-700">{resultado.detalhes}</p>}
          {resultado.codigo && (
            <Etiqueta cor="red" className="mt-2">
              {resultado.codigo}
            </Etiqueta>
          )}
        </div>
      </div>
      <Evidencia r={resultado.reconhecimento} />
    </div>
  );
}
