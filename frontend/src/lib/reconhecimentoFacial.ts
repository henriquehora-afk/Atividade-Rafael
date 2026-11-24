// API de Reconhecimento Facial (local / simulada).
//
// - Com câmera (getUserMedia): captura um frame real e calcula seu SHA-256 como evidência
//   da captura. A "identificação" é simulada: o fiscal confirma qual colaborador está na
//   frente da câmera (ou digita a matrícula), e o motor devolve o foto_hash biométrico
//   correspondente + a confiança facial (0.00–100.00).
// - Sem câmera: fallback manual com os mesmos parâmetros.
import type { Colaborador } from './tipos';

export interface ParametrosReconhecimento {
  matricula: string;
  colaboradores: Colaborador[];
  confiancaSimulada: number;
  simularDivergencia?: boolean;
  frameSha256?: string | null;
}

export interface ResultadoReconhecimento {
  foto_hash: string;
  confianca_facial: number;
  colaborador: Colaborador | null;
  origem: 'CAMERA' | 'SIMULADA';
  frame_sha256: string | null;
}

/** Arredonda para DECIMAL(5,2) deslocando a vírgula na notação decimal (sem viés binário). */
export function arredondar2(valor: number): number {
  const deslocado = Number(`${valor}e2`);
  if (!Number.isFinite(deslocado)) return Math.round(valor * 100) / 100;
  return Number(`${Math.round(deslocado)}e-2`);
}

export function reconhecer(p: ParametrosReconhecimento): ResultadoReconhecimento {
  const colaborador = p.colaboradores.find((c) => c.matricula === p.matricula.trim()) ?? null;
  let fotoHash = colaborador ? colaborador.hash_template_facial : `hash_facial_desconhecido_${p.matricula.trim()}`;
  if (p.simularDivergencia) fotoHash = `hash_facial_divergente_${Date.now()}`;
  return {
    foto_hash: fotoHash,
    confianca_facial: arredondar2(Math.min(100, Math.max(0, p.confiancaSimulada))),
    colaborador,
    origem: p.frameSha256 ? 'CAMERA' : 'SIMULADA',
    frame_sha256: p.frameSha256 ?? null,
  };
}

/** Captura o frame atual do <video> e devolve o SHA-256 (hex) dos pixels. */
export async function capturarFrameSha256(video: HTMLVideoElement): Promise<string | null> {
  if (!video.videoWidth || !video.videoHeight || !globalThis.crypto?.subtle) return null;
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = Math.round((160 * video.videoHeight) / video.videoWidth);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const digest = await crypto.subtle.digest('SHA-256', pixels);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
