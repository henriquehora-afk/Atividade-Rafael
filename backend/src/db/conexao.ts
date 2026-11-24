import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SCHEMA_TABELAS, SCHEMA_TRIGGERS, SCHEMA_VIEWS } from './schemaSqlite.js';

export type ConexaoSGBD = DatabaseSync;

/**
 * Abre o SGBD SQLite (módulo nativo node:sqlite — sem node-gyp/Build Tools),
 * liga a integridade referencial e aplica DDL, triggers e views.
 *
 * @param caminho arquivo .db ou ':memory:' (testes)
 */
export function abrirConexao(caminho: string): ConexaoSGBD {
  if (caminho !== ':memory:') {
    mkdirSync(dirname(caminho), { recursive: true });
  }
  const db = new DatabaseSync(caminho);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (caminho !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }
  db.exec(SCHEMA_TABELAS);
  db.exec(SCHEMA_TRIGGERS);
  db.exec(SCHEMA_VIEWS);

  const fk = db.prepare('PRAGMA foreign_keys').get() as { foreign_keys: number };
  if (fk.foreign_keys !== 1) {
    throw new Error('Falha ao habilitar PRAGMA foreign_keys no SGBD');
  }
  return db;
}
