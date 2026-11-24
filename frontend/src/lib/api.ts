// Cliente HTTP da API do SGF. Distingue erro de REGRA (ErroApi) de falha de REDE (ErroRede),
// o que permite ao Modo Campo cair automaticamente na fila offline.
import type {
  BatidaDetalhada,
  Colaborador,
  DadosBatida,
  EscalaTurno,
  JustificativaAjuste,
  LinhaEspelho,
  Obra,
  ResultadoSync,
  ResumoDashboard,
  RetornoSucesso,
} from './tipos';

let baseUrl = '';

/** Em produção/dev o Vite faz proxy de /api; nos testes de sistema apontamos para a API real. */
export function definirBaseUrlApi(url: string): void {
  baseUrl = url.replace(/\/$/, '');
}

export class ErroApi extends Error {
  readonly status: number;
  readonly erro: string;
  readonly detalhes?: string;
  readonly codigo?: string;

  constructor(status: number, erro: string, detalhes?: string, codigo?: string) {
    super(detalhes ? `${erro}: ${detalhes}` : erro);
    this.name = 'ErroApi';
    this.status = status;
    this.erro = erro;
    this.detalhes = detalhes;
    this.codigo = codigo;
  }
}

export class ErroRede extends Error {
  constructor(mensagem = 'Servidor inalcancavel (falha de rede)') {
    super(mensagem);
    this.name = 'ErroRede';
  }
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

export async function requisitar<T>(metodo: Metodo, caminho: string, corpo?: unknown, timeoutMs = 8000): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(baseUrl + caminho, {
      method: metodo,
      headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ErroRede();
  }

  const texto = await resposta.text();
  let dados: unknown = null;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    dados = null;
  }

  if (!resposta.ok) {
    const corpoErro = dados as { erro?: string; detalhes?: string; codigo?: string } | null;
    // 5xx sem corpo JSON da API = proxy sem backend (servidor fora do ar) -> tratar como rede.
    if (resposta.status >= 500 && !corpoErro?.erro) throw new ErroRede(`Servidor indisponivel (HTTP ${resposta.status})`);
    throw new ErroApi(resposta.status, corpoErro?.erro ?? `HTTP ${resposta.status}`, corpoErro?.detalhes, corpoErro?.codigo);
  }
  return dados as T;
}

export const api = {
  saude: () => requisitar<{ status: string }>('GET', '/api/health', undefined, 3000),

  // Fluxo crítico
  registarPonto: (dados: DadosBatida & { sincronizado_offline: boolean }) => requisitar<RetornoSucesso>('POST', '/api/pontos', dados),
  sincronizar: (batidas: Array<DadosBatida & { id_local: string; sincronizado_offline: true }>) =>
    requisitar<ResultadoSync>('POST', '/api/pontos/sync', { batidas }, 20000),
  tentarAlterarBatida: (id: number) => requisitar<never>('PUT', `/api/pontos/${id}`, { data_hora_batida: '2000-01-01 00:00:00' }),

  // Cadastros mestres
  listarObras: () => requisitar<Obra[]>('GET', '/api/obras'),
  criarObra: (o: Omit<Obra, 'id_obra'>) => requisitar<Obra>('POST', '/api/obras', o),
  atualizarObra: (o: Obra) => requisitar<Obra>('PUT', `/api/obras/${o.id_obra}`, o),
  excluirObra: (id: number) => requisitar<void>('DELETE', `/api/obras/${id}`),

  listarEscalas: () => requisitar<EscalaTurno[]>('GET', '/api/escalas'),
  criarEscala: (e: Omit<EscalaTurno, 'id_escala'>) => requisitar<EscalaTurno>('POST', '/api/escalas', e),
  atualizarEscala: (e: EscalaTurno) => requisitar<EscalaTurno>('PUT', `/api/escalas/${e.id_escala}`, e),
  excluirEscala: (id: number) => requisitar<void>('DELETE', `/api/escalas/${id}`),

  listarColaboradores: () => requisitar<Colaborador[]>('GET', '/api/colaboradores'),
  criarColaborador: (c: Omit<Colaborador, 'id_colaborador'>) => requisitar<Colaborador>('POST', '/api/colaboradores', c),
  atualizarColaborador: (c: Colaborador) => requisitar<Colaborador>('PUT', `/api/colaboradores/${c.id_colaborador}`, c),
  excluirColaborador: (id: number) => requisitar<void>('DELETE', `/api/colaboradores/${id}`),

  // RH / auditoria
  resumoDashboard: () => requisitar<ResumoDashboard>('GET', '/api/dashboard/resumo'),
  espelho: (filtro: { inicio?: string; fim?: string; id_colaborador?: number }) => {
    const q = new URLSearchParams();
    if (filtro.inicio) q.set('inicio', filtro.inicio);
    if (filtro.fim) q.set('fim', filtro.fim);
    if (filtro.id_colaborador) q.set('id_colaborador', String(filtro.id_colaborador));
    return requisitar<LinhaEspelho[]>('GET', `/api/dashboard/espelho?${q.toString()}`);
  },
  listarBatidas: () => requisitar<BatidaDetalhada[]>('GET', '/api/pontos?limite=50'),
  registrarJustificativa: (j: { id_registo: number; motivo_ajuste: string; responsavel_rh: string }) =>
    requisitar<JustificativaAjuste>('POST', '/api/justificativas', j),
};
