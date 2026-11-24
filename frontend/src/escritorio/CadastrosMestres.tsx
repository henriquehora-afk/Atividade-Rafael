import { Building2, CalendarClock, Pencil, Plus, Save, Trash2, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Botao, Cartao, cx, Vazio } from '../componentes/ui';
import { api, ErroApi } from '../lib/api';
import { formatarDataHora } from '../lib/tempo';
import type { Colaborador, EscalaTurno, Obra } from '../lib/tipos';

type Aba = 'obras' | 'escalas' | 'colaboradores';

function mensagemErro(e: unknown): string {
  return e instanceof ErroApi ? `${e.erro}${e.detalhes ? ` — ${e.detalhes}` : ''}` : e instanceof Error ? e.message : String(e);
}

function Campo({ rotulo, children, className }: { rotulo: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="rotulo">{rotulo}</span>
      {children}
    </label>
  );
}

function Acoes({ aoEditar, aoExcluir }: { aoEditar: () => void; aoExcluir: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <button type="button" onClick={aoEditar} className="rounded p-1.5 text-slate-500 hover:bg-sky-50 hover:text-sgf-primaria" aria-label="Editar" title="Editar">
        <Pencil className="size-4" />
      </button>
      <button type="button" onClick={aoExcluir} className="rounded p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600" aria-label="Excluir" title="Excluir">
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}

function RodapeFormulario({ editando, salvando, aoCancelar }: { editando: boolean; salvando: boolean; aoCancelar: () => void }) {
  return (
    <div className="flex items-end gap-2">
      <Botao type="submit" carregando={salvando} icone={editando ? <Save className="size-4" /> : <Plus className="size-4" />}>
        {editando ? 'Salvar' : 'Adicionar'}
      </Botao>
      {editando && (
        <Botao type="button" variante="fantasma" icone={<X className="size-4" />} onClick={aoCancelar}>
          Cancelar
        </Botao>
      )}
    </div>
  );
}

export default function CadastrosMestres({ aoAlterar }: { aoAlterar: () => void }) {
  const [aba, setAba] = useState<Aba>('colaboradores');
  const [obras, setObras] = useState<Obra[]>([]);
  const [escalas, setEscalas] = useState<EscalaTurno[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [mensagem, setMensagem] = useState<{ erro: boolean; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const vazioObra = { id_obra: 0, codigo_obra: '', nome_canteiro: '', localidade: '' };
  const vazioEscala = { id_escala: 0, descricao_turno: '', carga_horaria_diaria_min: 480, tolerancia_clt_min: 10 };
  const vazioColab = { id_colaborador: 0, id_escala: 1, matricula: '', nome_completo: '', funcao: '', hash_template_facial: '' };
  const [obra, setObra] = useState<Obra>(vazioObra);
  const [escala, setEscala] = useState<EscalaTurno>(vazioEscala);
  const [colab, setColab] = useState<Colaborador>(vazioColab);

  const carregar = useCallback(async () => {
    try {
      const [o, e, c] = await Promise.all([api.listarObras(), api.listarEscalas(), api.listarColaboradores()]);
      setObras(o);
      setEscalas(e);
      setColaboradores(c);
    } catch (e) {
      setMensagem({ erro: true, texto: mensagemErro(e) });
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  async function executar(acao: () => Promise<unknown>, sucesso: string, aoConcluir?: () => void) {
    setSalvando(true);
    setMensagem(null);
    try {
      await acao();
      setMensagem({ erro: false, texto: sucesso });
      aoConcluir?.();
      await carregar();
      aoAlterar();
    } catch (e) {
      setMensagem({ erro: true, texto: mensagemErro(e) });
    } finally {
      setSalvando(false);
    }
  }

  const excluir = (rotulo: string, acao: () => Promise<unknown>) => {
    if (window.confirm(`Excluir ${rotulo}? O SGBD bloqueia a exclusão se houver registros vinculados (ON DELETE RESTRICT).`)) {
      void executar(acao, `${rotulo} excluído(a).`);
    }
  };

  const salvarObra = (e: FormEvent) => {
    e.preventDefault();
    const { id_obra, ...dados } = obra;
    void executar(() => (id_obra ? api.atualizarObra(obra) : api.criarObra(dados)), id_obra ? 'Obra atualizada.' : 'Obra cadastrada.', () => setObra(vazioObra));
  };
  const salvarEscala = (e: FormEvent) => {
    e.preventDefault();
    const { id_escala, ...dados } = escala;
    void executar(() => (id_escala ? api.atualizarEscala(escala) : api.criarEscala(dados)), id_escala ? 'Escala atualizada.' : 'Escala cadastrada.', () =>
      setEscala(vazioEscala),
    );
  };
  const salvarColab = (e: FormEvent) => {
    e.preventDefault();
    const { id_colaborador, ...dados } = colab;
    const corpo = { ...dados, hash_template_facial: dados.hash_template_facial.trim() };
    void executar(
      () => (id_colaborador ? api.atualizarColaborador({ ...colab, ...corpo }) : api.criarColaborador(corpo)),
      id_colaborador ? 'Colaborador atualizado — as batidas refletem o novo cadastro (3FN, sem duplicação).' : 'Colaborador cadastrado.',
      () => setColab(vazioColab),
    );
  };

  const abas: { id: Aba; rotulo: string; Icone: typeof Users; qtd: number }[] = [
    { id: 'colaboradores', rotulo: 'COLABORADOR', Icone: Users, qtd: colaboradores.length },
    { id: 'obras', rotulo: 'OBRA', Icone: Building2, qtd: obras.length },
    { id: 'escalas', rotulo: 'ESCALA_TURNO', Icone: CalendarClock, qtd: escalas.length },
  ];

  return (
    <Cartao>
      <div className="flex flex-wrap gap-2 border-b border-slate-200 p-3">
        {abas.map(({ id, rotulo, Icone, qtd }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setAba(id);
              setMensagem(null);
            }}
            className={cx(
              'flex items-center gap-2 rounded-lg px-3 py-1.5 font-mono text-xs font-semibold transition',
              aba === id ? 'bg-sgf-escuro text-white' : 'text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
            )}
          >
            <Icone className="size-4" aria-hidden /> {rotulo}
            <span className={cx('rounded px-1.5 text-[10px]', aba === id ? 'bg-white/15' : 'bg-slate-100')}>{qtd}</span>
          </button>
        ))}
      </div>

      {mensagem && (
        <p className={cx('border-b px-4 py-2 text-sm', mensagem.erro ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800')}>
          {mensagem.texto}
        </p>
      )}

      {aba === 'obras' && (
        <>
          <form onSubmit={salvarObra} className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-[10rem_1fr_12rem_auto]">
            <Campo rotulo="Código (UK)">
              <input className="campo font-mono" required maxLength={50} value={obra.codigo_obra} onChange={(e) => setObra({ ...obra, codigo_obra: e.target.value })} placeholder="OBRA-011" />
            </Campo>
            <Campo rotulo="Nome do canteiro">
              <input className="campo" required maxLength={150} value={obra.nome_canteiro} onChange={(e) => setObra({ ...obra, nome_canteiro: e.target.value })} />
            </Campo>
            <Campo rotulo="Localidade">
              <input className="campo" required maxLength={100} value={obra.localidade} onChange={(e) => setObra({ ...obra, localidade: e.target.value })} />
            </Campo>
            <RodapeFormulario editando={!!obra.id_obra} salvando={salvando} aoCancelar={() => setObra(vazioObra)} />
          </form>
          <Tabela cabecalho={['id_obra', 'codigo_obra', 'nome_canteiro', 'localidade', '']}>
            {obras.length === 0 && <LinhaVazia colunas={5} />}
            {obras.map((o) => (
              <tr key={o.id_obra} className="hover:bg-slate-50">
                <td className="num px-4 py-2 font-mono text-xs text-slate-500">{o.id_obra}</td>
                <td className="px-4 py-2 font-mono text-xs font-semibold">{o.codigo_obra}</td>
                <td className="px-4 py-2 font-semibold">{o.nome_canteiro}</td>
                <td className="px-4 py-2 text-slate-600">{o.localidade}</td>
                <td className="px-4 py-2">
                  <Acoes aoEditar={() => setObra(o)} aoExcluir={() => excluir(`a obra ${o.codigo_obra}`, () => api.excluirObra(o.id_obra))} />
                </td>
              </tr>
            ))}
          </Tabela>
        </>
      )}

      {aba === 'escalas' && (
        <>
          <form onSubmit={salvarEscala} className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-[1fr_11rem_11rem_auto]">
            <Campo rotulo="Descrição do turno">
              <input className="campo" required maxLength={100} value={escala.descricao_turno} onChange={(e) => setEscala({ ...escala, descricao_turno: e.target.value })} />
            </Campo>
            <Campo rotulo="Carga diária (min)">
              <input
                type="number"
                className="campo num"
                required
                min={1}
                max={720}
                value={escala.carga_horaria_diaria_min}
                onChange={(e) => setEscala({ ...escala, carga_horaria_diaria_min: Number(e.target.value) })}
              />
            </Campo>
            <Campo rotulo="Tolerância CLT (min)">
              <input
                type="number"
                className="campo num"
                required
                min={0}
                max={10}
                value={escala.tolerancia_clt_min}
                onChange={(e) => setEscala({ ...escala, tolerancia_clt_min: Number(e.target.value) })}
              />
            </Campo>
            <RodapeFormulario editando={!!escala.id_escala} salvando={salvando} aoCancelar={() => setEscala(vazioEscala)} />
          </form>
          <Tabela cabecalho={['id_escala', 'descricao_turno', 'carga_horaria_diaria_min', 'tolerancia_clt_min', '']}>
            {escalas.length === 0 && <LinhaVazia colunas={5} />}
            {escalas.map((s) => (
              <tr key={s.id_escala} className="hover:bg-slate-50">
                <td className="num px-4 py-2 font-mono text-xs text-slate-500">{s.id_escala}</td>
                <td className="px-4 py-2 font-semibold">{s.descricao_turno}</td>
                <td className="num px-4 py-2 font-mono">
                  {s.carga_horaria_diaria_min} min <span className="text-slate-400">({(s.carga_horaria_diaria_min / 60).toFixed(2)} h)</span>
                </td>
                <td className="num px-4 py-2 font-mono">{s.tolerancia_clt_min} min</td>
                <td className="px-4 py-2">
                  <Acoes aoEditar={() => setEscala(s)} aoExcluir={() => excluir(`a escala "${s.descricao_turno}"`, () => api.excluirEscala(s.id_escala))} />
                </td>
              </tr>
            ))}
          </Tabela>
        </>
      )}

      {aba === 'colaboradores' && (
        <>
          <form onSubmit={salvarColab} className="grid gap-3 border-b border-slate-200 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_8rem_10rem_14rem]">
            <Campo rotulo="Nome completo">
              <input className="campo" required maxLength={150} value={colab.nome_completo} onChange={(e) => setColab({ ...colab, nome_completo: e.target.value })} />
            </Campo>
            <Campo rotulo="Matrícula (UK)">
              <input className="campo font-mono" required maxLength={30} value={colab.matricula} onChange={(e) => setColab({ ...colab, matricula: e.target.value })} />
            </Campo>
            <Campo rotulo="Função">
              <input className="campo" required maxLength={100} value={colab.funcao} onChange={(e) => setColab({ ...colab, funcao: e.target.value })} />
            </Campo>
            <Campo rotulo="Escala (FK)">
              <select className="campo" value={colab.id_escala} onChange={(e) => setColab({ ...colab, id_escala: Number(e.target.value) })}>
                {escalas.map((s) => (
                  <option key={s.id_escala} value={s.id_escala}>
                    {s.id_escala} · {s.descricao_turno}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="hash_template_facial" className="sm:col-span-2 lg:col-span-3">
              <input
                className="campo font-mono text-xs"
                maxLength={255}
                value={colab.hash_template_facial}
                onChange={(e) => setColab({ ...colab, hash_template_facial: e.target.value })}
                placeholder="Em branco = gerado automaticamente (hash_facial_<nome>_<matricula>)"
              />
            </Campo>
            <RodapeFormulario editando={!!colab.id_colaborador} salvando={salvando} aoCancelar={() => setColab(vazioColab)} />
          </form>
          <Tabela cabecalho={['id', 'matricula', 'nome_completo', 'funcao', 'escala', 'última SAIDA', 'batidas', '']}>
            {colaboradores.length === 0 && <LinhaVazia colunas={8} />}
            {colaboradores.map((c) => (
              <tr key={c.id_colaborador} className="hover:bg-slate-50">
                <td className="num px-4 py-2 font-mono text-xs text-slate-500">{c.id_colaborador}</td>
                <td className="px-4 py-2 font-mono text-xs font-semibold">{c.matricula}</td>
                <td className="px-4 py-2">
                  <p className="font-semibold">{c.nome_completo}</p>
                  <p className="font-mono text-[10px] text-slate-400">{c.hash_template_facial}</p>
                </td>
                <td className="px-4 py-2 text-slate-600">{c.funcao}</td>
                <td className="px-4 py-2 text-xs text-slate-600">{c.descricao_turno}</td>
                <td className="num px-4 py-2 font-mono text-xs">{formatarDataHora(c.ultima_saida)}</td>
                <td className="num px-4 py-2 text-right font-mono text-xs">{c.total_batidas ?? 0}</td>
                <td className="px-4 py-2">
                  <Acoes
                    aoEditar={() =>
                      setColab({
                        id_colaborador: c.id_colaborador,
                        id_escala: c.id_escala,
                        matricula: c.matricula,
                        nome_completo: c.nome_completo,
                        funcao: c.funcao,
                        hash_template_facial: c.hash_template_facial,
                      })
                    }
                    aoExcluir={() => excluir(`o colaborador ${c.nome_completo}`, () => api.excluirColaborador(c.id_colaborador))}
                  />
                </td>
              </tr>
            ))}
          </Tabela>
        </>
      )}
    </Cartao>
  );
}

function Tabela({ cabecalho, children }: { cabecalho: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left font-mono text-[11px] text-slate-500">
          <tr>
            {cabecalho.map((c, i) => (
              <th key={i} className="px-4 py-2 font-semibold">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

function LinhaVazia({ colunas }: { colunas: number }) {
  return (
    <tr>
      <td colSpan={colunas}>
        <Vazio>Nenhum registro.</Vazio>
      </td>
    </tr>
  );
}
