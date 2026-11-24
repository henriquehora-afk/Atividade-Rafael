// Conectividade efetiva do Modo Campo:
//   navigator.onLine  &&  !Modo Avião (toggle de demonstração)  &&  /api/health alcançável
import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';

const CHAVE_MODO_AVIAO = 'sgf:modoAviao';

export interface EstadoConectividade {
  online: boolean;
  navegadorOnline: boolean;
  modoAviao: boolean;
  servidorAlcancavel: boolean | null;
  definirModoAviao: (ativo: boolean) => void;
  verificar: () => Promise<void>;
  marcarFalhaRede: () => void;
}

export function useConectividade(intervaloMs = 8000): EstadoConectividade {
  const [navegadorOnline, setNavegadorOnline] = useState(() => navigator.onLine);
  const [modoAviao, setModoAviao] = useState(() => localStorage.getItem(CHAVE_MODO_AVIAO) === '1');
  const [servidorAlcancavel, setServidorAlcancavel] = useState<boolean | null>(null);

  const verificar = useCallback(async () => {
    if (modoAviao || !navigator.onLine) return;
    try {
      await api.saude();
      setServidorAlcancavel(true);
    } catch {
      setServidorAlcancavel(false);
    }
  }, [modoAviao]);

  useEffect(() => {
    const on = () => setNavegadorOnline(true);
    const off = () => setNavegadorOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  useEffect(() => {
    void verificar();
    const id = window.setInterval(() => void verificar(), intervaloMs);
    return () => window.clearInterval(id);
  }, [verificar, intervaloMs, navegadorOnline]);

  const definirModoAviao = useCallback((ativo: boolean) => {
    localStorage.setItem(CHAVE_MODO_AVIAO, ativo ? '1' : '0');
    setModoAviao(ativo);
  }, []);

  const marcarFalhaRede = useCallback(() => setServidorAlcancavel(false), []);

  return {
    online: navegadorOnline && !modoAviao && servidorAlcancavel === true,
    navegadorOnline,
    modoAviao,
    servidorAlcancavel,
    definirModoAviao,
    verificar,
    marcarFalhaRede,
  };
}
