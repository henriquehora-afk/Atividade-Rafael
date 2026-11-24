import { Camera, CameraOff, ScanFace } from 'lucide-react';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Botao, cx } from '../componentes/ui';

interface Props {
  videoRef: RefObject<HTMLVideoElement | null>;
  aoMudar: (ativa: boolean) => void;
  escaneando: boolean;
  rotuloAlvo?: string | null;
}

/** Câmera facial real via getUserMedia, com fallback para captura simulada. */
export default function CameraFacial({ videoRef, aoMudar, escaneando, rotuloAlvo }: Props) {
  const [estado, setEstado] = useState<'inativa' | 'iniciando' | 'ativa' | 'erro'>('inativa');
  const [erro, setErro] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => () => streamRef.current?.getTracks().forEach((t) => t.stop()), []);

  async function ativar() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setEstado('erro');
      setErro('getUserMedia indisponível neste navegador/contexto (exige HTTPS ou localhost). Use a captura simulada.');
      return;
    }
    setEstado('iniciando');
    setErro(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setEstado('ativa');
      aoMudar(true);
    } catch (e) {
      setEstado('erro');
      setErro(e instanceof DOMException ? `${e.name}: câmera bloqueada ou inexistente. Use a captura simulada.` : String(e));
      aoMudar(false);
    }
  }

  function desligar() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setEstado('inativa');
    aoMudar(false);
  }

  return (
    <div>
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-sgf-escuro ring-1 ring-slate-800">
        <video
          ref={videoRef}
          playsInline
          muted
          className={cx('absolute inset-0 size-full -scale-x-100 object-cover', estado !== 'ativa' && 'hidden')}
        />

        {estado !== 'ativa' && (
          <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_center,#1e293b,#0f172a)] p-6 text-center">
            <div>
              <ScanFace className="mx-auto size-14 text-sgf-destaque/70" strokeWidth={1.25} aria-hidden />
              <p className="mt-2 text-sm font-medium text-slate-200">
                {estado === 'iniciando' ? 'Solicitando acesso à câmera…' : 'Câmera desligada'}
              </p>
              <p className="mt-1 text-xs text-slate-400">
                {estado === 'erro' ? erro : 'Ative a câmera ou use a captura facial simulada abaixo.'}
              </p>
            </div>
          </div>
        )}

        {/* Guia oval de enquadramento */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div
            className={cx(
              'relative h-[72%] w-[46%] overflow-hidden rounded-[50%] border-2 border-dashed transition-colors',
              escaneando ? 'border-sgf-destaque' : 'border-white/35',
            )}
          >
            {escaneando && <div className="animar-varredura absolute inset-x-0 h-1/2 bg-gradient-to-b from-transparent via-sgf-destaque/35 to-transparent" />}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-6 pb-2 text-[11px] text-slate-200">
          <span className="flex items-center gap-1.5">
            <span className={cx('size-2 rounded-full', estado === 'ativa' ? 'animate-pulse bg-red-500' : 'bg-slate-500')} />
            {estado === 'ativa' ? 'Câmera real (getUserMedia)' : 'Modo simulado'}
          </span>
          {rotuloAlvo && <span className="truncate font-medium">{rotuloAlvo}</span>}
        </div>
      </div>

      <div className="mt-2 flex justify-end">
        {estado === 'ativa' ? (
          <Botao variante="fantasma" className="text-xs" icone={<CameraOff className="size-4" />} onClick={desligar}>
            Desligar câmera
          </Botao>
        ) : (
          <Botao variante="secundaria" className="text-xs" carregando={estado === 'iniciando'} icone={<Camera className="size-4" />} onClick={ativar}>
            Ativar câmera
          </Botao>
        )}
      </div>
    </div>
  );
}
