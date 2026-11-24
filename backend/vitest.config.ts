import { defineConfig } from 'vitest/config';
import { BaseSequencer, type TestSpecification } from 'vitest/node';

/** Executa os níveis do V-Model em ordem: 1-unidade → 2-integracao → 3-sistema → 4-aceitacao. */
class SequenciadorVModel extends BaseSequencer {
  override async sort(arquivos: TestSpecification[]): Promise<TestSpecification[]> {
    return [...arquivos].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    fileParallelism: false,
    sequence: { sequencer: SequenciadorVModel },
    reporters: ['verbose'],
    testTimeout: 20000,
  },
});
