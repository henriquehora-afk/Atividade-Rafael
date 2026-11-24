// Sincronização da fila offline -> POST /api/pontos/sync
// Envia em ordem cronológica preservando o data_hora_batida ORIGINAL da captura.
// Aceitos -> SINCRONIZADO ("Ponto Sincronizado"); rejeitados -> CONFLITO com motivo visível.
import { api } from './api';
import { dbLocal } from './dbLocal';
import { agoraLocal } from './tempo';
import type { BatidaLocal } from './tipos';

export interface ResumoSincronizacao {
  enviados: number;
  sincronizados: number;
  conflitos: number;
}

let emAndamento: Promise<ResumoSincronizacao> | null = null;

export async function listarPendentes(): Promise<BatidaLocal[]> {
  const pendentes = await dbLocal.batidas.where('status').equals('PENDENTE').toArray();
  return pendentes.sort(
    (a, b) => a.data_hora_batida.localeCompare(b.data_hora_batida) || a.criado_em.localeCompare(b.criado_em),
  );
}

/** Garante uma única sincronização por vez (chamadas concorrentes recebem a mesma promise). */
export function sincronizarPendentes(): Promise<ResumoSincronizacao> {
  if (!emAndamento) {
    emAndamento = executar().finally(() => {
      emAndamento = null;
    });
  }
  return emAndamento;
}

async function executar(): Promise<ResumoSincronizacao> {
  const pendentes = await listarPendentes();
  if (pendentes.length === 0) return { enviados: 0, sincronizados: 0, conflitos: 0 };

  // Em caso de ErroRede, nada é alterado: os itens continuam PENDENTES para a próxima tentativa.
  const resposta = await api.sincronizar(
    pendentes.map((b) => ({
      id_local: b.id_local,
      matricula: b.matricula,
      foto_hash: b.foto_hash,
      data_hora_batida: b.data_hora_batida,
      id_obra: b.id_obra,
      tipo_batida: b.tipo_batida,
      confianca_facial: b.confianca_facial,
      sincronizado_offline: true as const,
    })),
  );

  const agora = agoraLocal();
  let sincronizados = 0;
  let conflitos = 0;
  await dbLocal.transaction('rw', dbLocal.batidas, dbLocal.colaboradores, async () => {
    for (const r of resposta.resultados) {
      const local = await dbLocal.batidas.get(r.id_local);
      if (!local) continue;
      if (r.status === 'SINCRONIZADO') {
        sincronizados++;
        await dbLocal.batidas.update(r.id_local, {
          status: 'SINCRONIZADO',
          id_registo: r.id_registo,
          horas_acumuladas: r.horas_acumuladas,
          sincronizado_em: agora,
          erro: undefined,
          detalhes: undefined,
          codigo: undefined,
        });
        if (local.tipo_batida === 'SAIDA') {
          const colab = await dbLocal.colaboradores.get(local.matricula);
          if (colab && (!colab.ultima_saida || colab.ultima_saida < local.data_hora_batida)) {
            await dbLocal.colaboradores.update(local.matricula, { ultima_saida: local.data_hora_batida });
          }
        }
      } else {
        conflitos++;
        await dbLocal.batidas.update(r.id_local, {
          status: 'CONFLITO',
          erro: r.erro,
          detalhes: r.detalhes,
          codigo: r.codigo,
          sincronizado_em: agora,
        });
      }
    }
  });
  return { enviados: pendentes.length, sincronizados, conflitos };
}
