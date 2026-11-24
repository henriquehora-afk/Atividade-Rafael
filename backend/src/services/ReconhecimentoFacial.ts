/**
 * API de Reconhecimento Facial (simulada).
 *
 * No dispositivo do fiscal, o módulo de câmera gera um `foto_hash` (identidade
 * biométrica extraída do rosto) e uma `confianca_facial` (0.00–100.00). No servidor,
 * a regra confere o `foto_hash` contra o `hash_template_facial` cadastrado.
 * Em produção esta classe seria substituída por um provedor real (ex.: embeddings
 * faciais com distância cosseno); a interface permanece a mesma.
 */
export interface ResultadoComparacaoFacial {
  confere: boolean;
  /** Similaridade estimada entre o hash capturado e o template (0–100). */
  similaridade: number;
}

export class ReconhecimentoFacial {
  comparar(fotoHash: string, hashTemplateFacial: string): ResultadoComparacaoFacial {
    const confere = fotoHash.trim().toLowerCase() === hashTemplateFacial.trim().toLowerCase();
    return { confere, similaridade: confere ? 100 : 0 };
  }
}
