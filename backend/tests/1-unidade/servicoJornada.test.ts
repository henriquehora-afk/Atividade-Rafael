/**
 * Unidade do participante "ServicoJornada (Regra)" isolado do SGBD
 * (repositório falso que registra as chamadas do diagrama de sequência).
 */
import { describe, expect, it } from 'vitest';
import type { Colaborador, NovoRegistoPonto, Obra, RetornoConsultaColaborador } from '../../src/modelos.js';
import type { RepositorioJornada } from '../../src/repositories/PersistenciaSGBD.js';
import { ErroDominio, MSG_MATRICULA_OU_INTERJORNADA } from '../../src/services/erros.js';
import { ServicoJornada } from '../../src/services/ServicoJornada.js';

const MARCOS: Colaborador = {
  id_colaborador: 2,
  id_escala: 1,
  matricula: '2048',
  nome_completo: 'Marcos Silva',
  funcao: 'Eletricista',
  hash_template_facial: 'hash_facial_marcos_2048',
};
const OBRA: Obra = { id_obra: 10, codigo_obra: 'OBRA-010', nome_canteiro: 'Arena MRV - Setor A', localidade: 'CAPITAL' };

class RepositorioFalso implements RepositorioJornada {
  chamadas: string[] = [];
  inseridos: NovoRegistoPonto[] = [];
  private readonly ultimaSaida: string | null;

  constructor(ultimaSaida: string | null) {
    this.ultimaSaida = ultimaSaida;
  }

  consultarColaboradorEUltimaSaida(matricula: string): RetornoConsultaColaborador {
    this.chamadas.push('consultarColaboradorEUltimaSaida');
    return matricula === MARCOS.matricula
      ? { status_cadastro: 'ATIVO', colaborador: MARCOS, timestamp_ultima_saida: this.ultimaSaida }
      : { status_cadastro: 'INEXISTENTE', colaborador: null, timestamp_ultima_saida: null };
  }
  buscarObraPorId(id: number) {
    return id === OBRA.id_obra ? OBRA : null;
  }
  buscarBatidaIdentica() {
    return null;
  }
  inserirRegistoPonto(d: NovoRegistoPonto) {
    this.chamadas.push('inserirRegistoPonto');
    this.inseridos.push(d);
    return { id_registo: 77, status_imutavel: true as const };
  }
  consultarHorasAcumuladas() {
    return { minutos_trabalhados: 0, horas_trabalhadas: '0.00' };
  }
}

const entrada = (extra: Record<string, unknown> = {}) => ({
  matricula: '2048',
  foto_hash: 'hash_facial_marcos_2048',
  data_hora_batida: '2026-03-10 08:00:00',
  id_obra: 10,
  tipo_batida: 'ENTRADA',
  confianca_facial: 96.5,
  sincronizado_offline: false,
  ...extra,
});

function capturar(fn: () => unknown): ErroDominio {
  try {
    fn();
  } catch (e) {
    if (e instanceof ErroDominio) return e;
    throw e;
  }
  throw new Error('era esperado ErroDominio');
}

describe('[V-Model 1 · Unidade] ServicoJornada.validarERegistarBatida — fragmento alt', () => {
  it('[alt] interjornada de 10h59min → 5a. erroValidacao 422 e NENHUM INSERT', () => {
    const repo = new RepositorioFalso('2026-03-09 21:01:00');
    const erro = capturar(() => new ServicoJornada(repo).validarERegistarBatida(entrada()));
    expect(erro.statusCode).toBe(422);
    expect(erro.erro).toBe(MSG_MATRICULA_OU_INTERJORNADA);
    expect(erro.codigo).toBe('VIOLACAO_INTERJORNADA');
    expect(erro.detalhes).toContain('10h59min');
    expect(repo.chamadas).toEqual(['consultarColaboradorEUltimaSaida']);
    expect(repo.inseridos).toHaveLength(0);
  });

  it('[else] interjornada de 11h00min → 5b. INSERT e 7b. retornoSucesso com status_imutavel', () => {
    const repo = new RepositorioFalso('2026-03-09 21:00:00');
    const r = new ServicoJornada(repo).validarERegistarBatida(entrada());
    expect(r).toMatchObject({ id_registo: 77, status_imutavel: true, data_hora_batida: '2026-03-10 08:00:00', horas_acumuladas: '0.00' });
    expect(repo.chamadas).toEqual(['consultarColaboradorEUltimaSaida', 'inserirRegistoPonto']);
    expect(repo.inseridos[0]).toMatchObject({ id_colaborador: 2, id_obra: 10, tipo_batida: 'ENTRADA', sincronizado_offline: false });
  });

  it('[alt] matrícula inexistente → 404 com a mensagem do diagrama', () => {
    const repo = new RepositorioFalso(null);
    const erro = capturar(() => new ServicoJornada(repo).validarERegistarBatida(entrada({ matricula: '99999' })));
    expect(erro.statusCode).toBe(404);
    expect(erro.erro).toBe(MSG_MATRICULA_OU_INTERJORNADA);
    expect(repo.inseridos).toHaveLength(0);
  });

  it('interjornada só se aplica à ENTRADA (SAIDA_ALMOCO logo após SAIDA é aceita)', () => {
    const repo = new RepositorioFalso('2026-03-10 07:00:00');
    expect(new ServicoJornada(repo).validarERegistarBatida(entrada({ tipo_batida: 'SAIDA_ALMOCO' })).status_imutavel).toBe(true);
  });

  it('confiança facial 84.99 → 422 antes de consultar o SGBD', () => {
    const repo = new RepositorioFalso(null);
    const erro = capturar(() => new ServicoJornada(repo).validarERegistarBatida(entrada({ confianca_facial: 84.99 })));
    expect(erro.statusCode).toBe(422);
    expect(erro.codigo).toBe('CONFIANCA_FACIAL_INSUFICIENTE');
    expect(repo.chamadas).toHaveLength(0);
  });

  it('confiança facial exatamente 85.00 é aceita (limite inclusivo)', () => {
    const repo = new RepositorioFalso(null);
    expect(new ServicoJornada(repo).validarERegistarBatida(entrada({ confianca_facial: 85 })).id_registo).toBe(77);
  });

  it('foto_hash divergente do hash_template_facial → 422 BIOMETRIA_DIVERGENTE', () => {
    const repo = new RepositorioFalso(null);
    const erro = capturar(() => new ServicoJornada(repo).validarERegistarBatida(entrada({ foto_hash: 'hash_de_outra_pessoa' })));
    expect(erro.codigo).toBe('BIOMETRIA_DIVERGENTE');
    expect(repo.inseridos).toHaveLength(0);
  });

  it('campos obrigatórios ausentes → 400 listando cada campo', () => {
    const repo = new RepositorioFalso(null);
    const erro = capturar(() => new ServicoJornada(repo).validarERegistarBatida({ matricula: '2048', tipo_batida: 'INTERVALO' }));
    expect(erro.statusCode).toBe(400);
    for (const campo of ['foto_hash', 'data_hora_batida', 'id_obra', 'tipo_batida', 'confianca_facial']) {
      expect(erro.detalhes).toContain(campo);
    }
  });
});
