// Persistência offline no cliente (IndexedDB via Dexie).
//  - batidas: fila offline + histórico local (status PENDENTE/SINCRONIZADO/CONFLITO/REJEITADO)
//  - colaboradores / obras: cache dos cadastros mestres para validação sem internet
import Dexie, { type Table } from 'dexie';
import type { BatidaLocal, Colaborador, Obra } from './tipos';

export class BancoLocalSGF extends Dexie {
  batidas!: Table<BatidaLocal, string>;
  colaboradores!: Table<Colaborador, string>;
  obras!: Table<Obra, number>;

  constructor() {
    super('sgf_modulo5_ponto');
    this.version(1).stores({
      batidas: 'id_local, status, data_hora_batida, criado_em, matricula',
      colaboradores: 'matricula, id_colaborador',
      obras: 'id_obra',
    });
  }
}

export const dbLocal = new BancoLocalSGF();
