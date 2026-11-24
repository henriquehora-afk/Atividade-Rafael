import { FileCheck2, Lock, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Botao } from '../componentes/ui';
import { api, ErroApi } from '../lib/api';
import { formatarDataHora } from '../lib/tempo';
import { rotuloTipo, type BatidaDetalhada } from '../lib/tipos';

const CHAVE_RESPONSAVEL = 'sgf:responsavelRh';

interface Props {
  batida: BatidaDetalhada;
  aoFechar: () => void;
  aoSalvar: () => void;
}

/** Retificação 0:1 — INSERT em JUSTIFICATIVA_AJUSTE sem tocar na batida original. */
export default function ModalJustificativa({ batida, aoFechar, aoSalvar }: Props) {
  const [motivo, setMotivo] = useState('');
  const [responsavel, setResponsavel] = useState(() => localStorage.getItem(CHAVE_RESPONSAVEL) ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await api.registrarJustificativa({ id_registo: batida.id_registo, motivo_ajuste: motivo.trim(), responsavel_rh: responsavel.trim() });
      localStorage.setItem(CHAVE_RESPONSAVEL, responsavel.trim());
      aoSalvar();
    } catch (err) {
      setErro(err instanceof ErroApi ? `${err.erro}${err.detalhes ? ` — ${err.detalhes}` : ''}` : String(err));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="titulo-justificativa">
      <form onSubmit={salvar} className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-sgf-escuro px-5 py-3 text-white">
          <h2 id="titulo-justificativa" className="flex items-center gap-2 font-display font-bold">
            <FileCheck2 className="size-5 text-sgf-destaque" aria-hidden /> Registrar Justificativa de Ajuste
          </h2>
          <button type="button" onClick={aoFechar} className="rounded p-1 text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Fechar">
            <X className="size-5" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div className="rounded-lg bg-slate-50 p-3 ring-1 ring-slate-200">
            <p className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-slate-500 uppercase">
              <Lock className="size-3.5" aria-hidden /> Batida original (imutável — Portaria 671/2021)
            </p>
            <dl className="num mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500">id_registo</dt>
              <dd className="font-mono font-semibold">#{batida.id_registo}</dd>
              <dt className="text-slate-500">Colaborador</dt>
              <dd className="font-semibold">
                {batida.nome_completo} · {batida.matricula}
              </dd>
              <dt className="text-slate-500">Tipo</dt>
              <dd>{rotuloTipo(batida.tipo_batida)}</dd>
              <dt className="text-slate-500">Data/hora</dt>
              <dd className="font-mono">{formatarDataHora(batida.data_hora_batida)}</dd>
              <dt className="text-slate-500">Obra</dt>
              <dd>{batida.nome_canteiro}</dd>
            </dl>
          </div>

          <label className="block">
            <span className="rotulo">Motivo do ajuste</span>
            <textarea
              className="campo min-h-24"
              required
              minLength={10}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: Colaborador esqueceu de registrar a entrada; presença confirmada pelo mestre de obras."
            />
            <span className="mt-1 block text-[11px] text-slate-500">Mínimo de 10 caracteres. Uma única justificativa por batida (cardinalidade 0:1).</span>
          </label>

          <label className="block">
            <span className="rotulo">Responsável RH</span>
            <input className="campo" required maxLength={150} value={responsavel} onChange={(e) => setResponsavel(e.target.value)} placeholder="Nome do gestor de RH" />
          </label>

          {erro && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200">{erro}</p>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
          <Botao type="button" variante="secundaria" onClick={aoFechar}>
            Cancelar
          </Botao>
          <Botao type="submit" carregando={salvando} icone={<FileCheck2 className="size-4" />}>
            Registrar justificativa
          </Botao>
        </div>
      </form>
    </div>
  );
}
