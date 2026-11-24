// Participante "Interface Mobile" do Diagrama de Sequência.
//
//   Fiscal -> 1. registarPonto(matricula, foto_hash, data_hora, id_obra, ...) -> Interface Mobile
//   Interface Mobile -> 2. validarERegistarBatida(dadosEntrada) -> ServicoJornada (API)
//   ... alt 6a. exibeMensagemErro(motivo_rejeicao)  |  8b. exibeConfirmacaoVisual(id_registo, "Ponto Sincronizado")
//
// Offline-First: se não houver conectividade (ou a chamada falhar por rede), a batida é
// validada contra o cache local e gravada na fila IndexedDB preservando o horário original.
import { api, ErroApi, ErroRede } from './api';
import { dbLocal } from './dbLocal';
import { avaliarInterjornada, CONFIANCA_FACIAL_MINIMA } from './regrasCLT';
import { agoraLocal, formatarDataHora } from './tempo';
import type { BatidaLocal, DadosBatida, RetornoSucesso } from './tipos';

export const MSG_MATRICULA_OU_INTERJORNADA = 'Matricula invalida ou violacao Interjornada < 11h';

export type ResultadoCampo =
  | { tipo: 'SINCRONIZADO'; batida: BatidaLocal; retorno: RetornoSucesso }
  | { tipo: 'PENDENTE'; batida: BatidaLocal; tempoMs: number }
  | { tipo: 'REJEITADO'; batida: BatidaLocal; erro: string; detalhes?: string; codigo?: string };

function novoId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function nomes(dados: DadosBatida) {
  const [colab, obra] = await Promise.all([dbLocal.colaboradores.get(dados.matricula), dbLocal.obras.get(dados.id_obra)]);
  return { colab, obra, nome_colaborador: colab?.nome_completo ?? null, nome_obra: obra?.nome_canteiro ?? null };
}

/** 1. registarPonto(...) — ponto de entrada do Fiscal de Obra. */
export async function registarPonto(dados: DadosBatida, contexto: { online: boolean; aoFalharRede?: () => void }): Promise<ResultadoCampo> {
  if (contexto.online) {
    try {
      // 2. validarERegistarBatida(dadosEntrada) no ServicoJornada
      const retorno = await api.registarPonto({ ...dados, sincronizado_offline: false });
      const batida: BatidaLocal = {
        ...dados,
        data_hora_batida: retorno.data_hora_batida,
        id_local: novoId(),
        nome_colaborador: retorno.comprovante_ponto.nome_completo,
        nome_obra: retorno.comprovante_ponto.nome_canteiro,
        sincronizado_offline: false,
        status: 'SINCRONIZADO',
        criado_em: agoraLocal(),
        sincronizado_em: agoraLocal(),
        id_registo: retorno.id_registo,
        horas_acumuladas: retorno.horas_acumuladas,
      };
      await dbLocal.batidas.add(batida);
      if (dados.tipo_batida === 'SAIDA') await atualizarUltimaSaidaCache(dados.matricula, retorno.data_hora_batida);
      // 8b. exibeConfirmacaoVisual(id_registo, "Ponto Sincronizado")
      return { tipo: 'SINCRONIZADO', batida, retorno };
    } catch (e) {
      if (e instanceof ErroApi) {
        // 6a. exibeMensagemErro(motivo_rejeicao)
        const { nome_colaborador, nome_obra } = await nomes(dados);
        const batida: BatidaLocal = {
          ...dados,
          id_local: novoId(),
          nome_colaborador,
          nome_obra,
          sincronizado_offline: false,
          status: 'REJEITADO',
          criado_em: agoraLocal(),
          erro: e.erro,
          detalhes: e.detalhes,
          codigo: e.codigo,
        };
        await dbLocal.batidas.add(batida);
        return { tipo: 'REJEITADO', batida, erro: e.erro, detalhes: e.detalhes, codigo: e.codigo };
      }
      if (!(e instanceof ErroRede)) throw e;
      contexto.aoFalharRede?.();
      // Falha de rede real -> cai para a fila offline (abaixo).
    }
  }
  return gravarOffline(dados);
}

/** Caminho offline: valida contra o cache local e grava na fila em < 2 s. */
export async function gravarOffline(dados: DadosBatida): Promise<ResultadoCampo> {
  const inicio = performance.now();
  const { colab, obra, nome_colaborador, nome_obra } = await nomes(dados);

  const rejeitar = async (erro: string, detalhes: string, codigo: string): Promise<ResultadoCampo> => {
    const batida: BatidaLocal = {
      ...dados,
      id_local: novoId(),
      nome_colaborador,
      nome_obra,
      sincronizado_offline: true,
      status: 'REJEITADO',
      criado_em: agoraLocal(),
      erro,
      detalhes,
      codigo,
    };
    await dbLocal.batidas.add(batida);
    return { tipo: 'REJEITADO', batida, erro, detalhes, codigo };
  };

  if (!colab) {
    return rejeitar(MSG_MATRICULA_OU_INTERJORNADA, `Matricula ${dados.matricula} nao encontrada no cache local de cadastros.`, 'COLABORADOR_INEXISTENTE');
  }
  if (!obra) {
    return rejeitar(MSG_MATRICULA_OU_INTERJORNADA, `Obra id_obra=${dados.id_obra} nao encontrada no cache local.`, 'OBRA_INEXISTENTE');
  }
  if (dados.confianca_facial < CONFIANCA_FACIAL_MINIMA) {
    return rejeitar(
      'Reconhecimento facial reprovado',
      `Confianca facial ${dados.confianca_facial.toFixed(2)}% abaixo do minimo exigido de ${CONFIANCA_FACIAL_MINIMA.toFixed(2)}%.`,
      'CONFIANCA_FACIAL_INSUFICIENTE',
    );
  }
  if (dados.foto_hash !== colab.hash_template_facial) {
    return rejeitar('Reconhecimento facial reprovado', `foto_hash nao confere com o template da matricula ${dados.matricula}.`, 'BIOMETRIA_DIVERGENTE');
  }

  // Interjornada offline = AVISO (a decisão final é do ServicoJornada na sincronização).
  let aviso: string | undefined;
  if (dados.tipo_batida === 'ENTRADA') {
    const ultimaSaida = await ultimaSaidaConhecida(dados.matricula, dados.data_hora_batida);
    const av = avaliarInterjornada(ultimaSaida, dados.data_hora_batida);
    if (!av.conforme) {
      aviso = `Possivel violacao Interjornada (ultima SAIDA conhecida ${formatarDataHora(ultimaSaida)}; faltam ${av.faltamMinutos} min). Sera validado na sincronizacao.`;
    }
  }

  const batida: BatidaLocal = {
    ...dados,
    id_local: novoId(),
    nome_colaborador,
    nome_obra,
    sincronizado_offline: true,
    status: 'PENDENTE',
    criado_em: agoraLocal(),
    aviso,
  };
  await dbLocal.batidas.add(batida);
  const tempoMs = Math.round((performance.now() - inicio) * 10) / 10;
  await dbLocal.batidas.update(batida.id_local, { tempo_gravacao_ms: tempoMs });
  return { tipo: 'PENDENTE', batida: { ...batida, tempo_gravacao_ms: tempoMs }, tempoMs };
}

/** Última SAIDA conhecida no dispositivo: cache do servidor + SAIDAs locais ainda não rejeitadas. */
export async function ultimaSaidaConhecida(matricula: string, ate: string): Promise<string | null> {
  const colab = await dbLocal.colaboradores.get(matricula);
  const locais = await dbLocal.batidas
    .where('matricula')
    .equals(matricula)
    .filter((b) => b.tipo_batida === 'SAIDA' && (b.status === 'PENDENTE' || b.status === 'SINCRONIZADO') && b.data_hora_batida <= ate)
    .toArray();
  const candidatos = [colab?.ultima_saida ?? null, ...locais.map((b) => b.data_hora_batida)].filter(
    (v): v is string => !!v && v <= ate,
  );
  return candidatos.sort().at(-1) ?? null;
}

async function atualizarUltimaSaidaCache(matricula: string, dataHora: string) {
  const colab = await dbLocal.colaboradores.get(matricula);
  if (colab && (!colab.ultima_saida || colab.ultima_saida < dataHora)) {
    await dbLocal.colaboradores.update(matricula, { ultima_saida: dataHora });
  }
}

/** Baixa os cadastros mestres para o cache offline (executado sempre que online). */
export async function atualizarCacheCadastros(): Promise<{ colaboradores: number; obras: number }> {
  const [colaboradores, obras] = await Promise.all([api.listarColaboradores(), api.listarObras()]);
  await dbLocal.transaction('rw', dbLocal.colaboradores, dbLocal.obras, async () => {
    await dbLocal.colaboradores.clear();
    await dbLocal.colaboradores.bulkPut(colaboradores);
    await dbLocal.obras.clear();
    await dbLocal.obras.bulkPut(obras);
  });
  return { colaboradores: colaboradores.length, obras: obras.length };
}
