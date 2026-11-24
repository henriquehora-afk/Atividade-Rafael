/**
 * Regras dos Cadastros Mestres (OBRA, ESCALA_TURNO, COLABORADOR).
 * Alterar um cadastro mestre reflete automaticamente em todas as batidas (3FN:
 * REGISTO_PONTO guarda apenas as FKs).
 */
import type { Colaborador, EscalaTurno, Obra } from '../modelos.js';
import type { PersistenciaSGBD } from '../repositories/PersistenciaSGBD.js';
import { ErroDominio, traduzirErroSGBD } from './erros.js';

type Bruto = Record<string, unknown>;

function exigirObjeto(v: unknown): Bruto {
  if (!v || typeof v !== 'object' || Array.isArray(v)) {
    throw new ErroDominio(400, 'Dados de entrada invalidos', 'Corpo da requisicao deve ser um objeto JSON.', 'DADOS_INVALIDOS');
  }
  return v as Bruto;
}

function campoTexto(d: Bruto, campo: string, max: number, invalidos: string[], obrigatorio = true): string {
  const v = d[campo];
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  if ((obrigatorio && !t) || t.length > max) invalidos.push(`${campo} (texto 1-${max})`);
  return t;
}

function campoInteiro(d: Bruto, campo: string, min: number, max: number, invalidos: string[], padrao?: number): number {
  const v = d[campo] ?? padrao;
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    invalidos.push(`${campo} (inteiro ${min}-${max})`);
    return NaN;
  }
  return n;
}

function falharSeInvalido(invalidos: string[]) {
  if (invalidos.length) {
    throw new ErroDominio(400, 'Dados de entrada invalidos', `Campos invalidos: ${invalidos.join(', ')}.`, 'DADOS_INVALIDOS');
  }
}

function exigirId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new ErroDominio(400, 'Dados de entrada invalidos', 'Identificador invalido.', 'DADOS_INVALIDOS');
  }
  return n;
}

/** Gera o identificador do template facial (simulado) a partir do nome e matrícula. */
export function gerarHashTemplateFacial(nomeCompleto: string, matricula: string): string {
  const primeiro = nomeCompleto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/\s+/)[0]
    ?.replace(/[^a-z0-9]/g, '');
  return `hash_facial_${primeiro || 'colaborador'}_${matricula}`;
}

export class ServicoCadastros {
  private readonly persistencia: PersistenciaSGBD;

  constructor(persistencia: PersistenciaSGBD) {
    this.persistencia = persistencia;
  }

  private excluirComIntegridade(fn: () => number, entidade: string, dependencias: string): void {
    try {
      if (fn() === 0) throw new ErroDominio(404, `${entidade} nao encontrada(o)`, 'Registro inexistente.', 'RECURSO_INEXISTENTE');
    } catch (e) {
      const t = traduzirErroSGBD(e);
      if (t?.codigo === 'INTEGRIDADE_REFERENCIAL') {
        throw new ErroDominio(
          409,
          'Exclusao bloqueada por integridade referencial',
          `${entidade} possui ${dependencias} vinculadas (FOREIGN KEY ... ON DELETE RESTRICT). Batidas sao imutaveis e preservam o historico.`,
          'INTEGRIDADE_REFERENCIAL',
        );
      }
      throw e;
    }
  }

  // ---------------------------------------------------------------- OBRA
  listarObras(): Obra[] {
    return this.persistencia.listarObras();
  }

  private validarObra(corpo: unknown): Omit<Obra, 'id_obra'> {
    const d = exigirObjeto(corpo);
    const inv: string[] = [];
    const o = {
      codigo_obra: campoTexto(d, 'codigo_obra', 50, inv).toUpperCase(),
      nome_canteiro: campoTexto(d, 'nome_canteiro', 150, inv),
      localidade: campoTexto(d, 'localidade', 100, inv),
    };
    falharSeInvalido(inv);
    return o;
  }

  criarObra(corpo: unknown): Obra {
    return this.persistencia.inserirObra(this.validarObra(corpo));
  }

  atualizarObra(id: unknown, corpo: unknown): Obra {
    const obra = { id_obra: exigirId(id), ...this.validarObra(corpo) };
    if (this.persistencia.atualizarObra(obra) === 0) {
      throw new ErroDominio(404, 'Obra nao encontrada', `id_obra=${obra.id_obra} inexistente.`, 'RECURSO_INEXISTENTE');
    }
    return obra;
  }

  excluirObra(id: unknown): void {
    const idObra = exigirId(id);
    this.excluirComIntegridade(() => this.persistencia.excluirObra(idObra), 'Obra', 'batidas (REGISTO_PONTO)');
  }

  // ---------------------------------------------------------------- ESCALA_TURNO
  listarEscalas(): EscalaTurno[] {
    return this.persistencia.listarEscalas();
  }

  private validarEscala(corpo: unknown): Omit<EscalaTurno, 'id_escala'> {
    const d = exigirObjeto(corpo);
    const inv: string[] = [];
    const e = {
      descricao_turno: campoTexto(d, 'descricao_turno', 100, inv),
      carga_horaria_diaria_min: campoInteiro(d, 'carga_horaria_diaria_min', 1, 720, inv),
      tolerancia_clt_min: campoInteiro(d, 'tolerancia_clt_min', 0, 10, inv, 10),
    };
    falharSeInvalido(inv);
    return e;
  }

  criarEscala(corpo: unknown): EscalaTurno {
    return this.persistencia.inserirEscala(this.validarEscala(corpo));
  }

  atualizarEscala(id: unknown, corpo: unknown): EscalaTurno {
    const escala = { id_escala: exigirId(id), ...this.validarEscala(corpo) };
    if (this.persistencia.atualizarEscala(escala) === 0) {
      throw new ErroDominio(404, 'Escala nao encontrada', `id_escala=${escala.id_escala} inexistente.`, 'RECURSO_INEXISTENTE');
    }
    return escala;
  }

  excluirEscala(id: unknown): void {
    const idEscala = exigirId(id);
    this.excluirComIntegridade(() => this.persistencia.excluirEscala(idEscala), 'Escala', 'colaboradores (COLABORADOR)');
  }

  // ---------------------------------------------------------------- COLABORADOR
  listarColaboradores() {
    return this.persistencia.listarColaboradores();
  }

  private validarColaborador(corpo: unknown): Omit<Colaborador, 'id_colaborador'> {
    const d = exigirObjeto(corpo);
    const inv: string[] = [];
    const c = {
      id_escala: campoInteiro(d, 'id_escala', 1, Number.MAX_SAFE_INTEGER, inv),
      matricula: campoTexto(d, 'matricula', 30, inv),
      nome_completo: campoTexto(d, 'nome_completo', 150, inv),
      funcao: campoTexto(d, 'funcao', 100, inv),
      hash_template_facial: campoTexto(d, 'hash_template_facial', 255, inv, false),
    };
    falharSeInvalido(inv);
    if (!this.persistencia.buscarEscalaPorId(c.id_escala)) {
      throw new ErroDominio(422, 'Escala inexistente', `id_escala=${c.id_escala} nao cadastrada (FOREIGN KEY).`, 'INTEGRIDADE_REFERENCIAL');
    }
    if (!c.hash_template_facial) c.hash_template_facial = gerarHashTemplateFacial(c.nome_completo, c.matricula);
    return c;
  }

  criarColaborador(corpo: unknown): Colaborador {
    return this.persistencia.inserirColaborador(this.validarColaborador(corpo));
  }

  atualizarColaborador(id: unknown, corpo: unknown): Colaborador {
    const colaborador = { id_colaborador: exigirId(id), ...this.validarColaborador(corpo) };
    if (this.persistencia.atualizarColaborador(colaborador) === 0) {
      throw new ErroDominio(404, 'Colaborador nao encontrado', `id_colaborador=${colaborador.id_colaborador} inexistente.`, 'RECURSO_INEXISTENTE');
    }
    return colaborador;
  }

  excluirColaborador(id: unknown): void {
    const idColaborador = exigirId(id);
    this.excluirComIntegridade(() => this.persistencia.excluirColaborador(idColaborador), 'Colaborador', 'batidas (REGISTO_PONTO)');
  }
}
