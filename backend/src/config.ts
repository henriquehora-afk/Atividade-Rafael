import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pastaBackend = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Variáveis com prefixo próprio: ferramentas (ex.: launchers de preview) costumam exportar PORT
// para o servidor web, o que faria a API colidir com o Vite (5173).
export const CONFIG = {
  porta: Number(process.env.SGF_API_PORT ?? 3333),
  host: process.env.SGF_API_HOST ?? '127.0.0.1',
  caminhoBanco: process.env.SGF_DB_PATH ?? resolve(pastaBackend, 'data', 'sgf.db'),
};
