// Regras CLT replicadas no dispositivo para feedback imediato (o servidor é a autoridade).
import { msIngenuo } from './tempo';

export const INTERJORNADA_MINIMA_MIN = 660; // CLT Art. 66
export const CONFIANCA_FACIAL_MINIMA = 85;

export interface AvaliacaoInterjornada {
  conforme: boolean;
  intervaloMinutos: number | null;
  faltamMinutos: number;
}

export function avaliarInterjornada(ultimaSaida: string | null | undefined, novaEntrada: string): AvaliacaoInterjornada {
  if (!ultimaSaida) return { conforme: true, intervaloMinutos: null, faltamMinutos: 0 };
  const segundos = Math.trunc((msIngenuo(novaEntrada) - msIngenuo(ultimaSaida)) / 1000);
  const minimo = INTERJORNADA_MINIMA_MIN * 60;
  const conforme = segundos >= minimo;
  return {
    conforme,
    intervaloMinutos: Math.floor(segundos / 60),
    faltamMinutos: conforme ? 0 : Math.ceil((minimo - segundos) / 60),
  };
}
