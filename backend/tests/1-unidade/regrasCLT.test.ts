import { describe, expect, it } from 'vitest';
import {
  avaliarInterjornada,
  calcularMinutosTrabalhados,
  minutosParaHorasDecimal,
  normalizarConfianca,
  somarIntervalosEmHoras,
} from '../../src/services/regrasCLT.js';
import { normalizarDataHora } from '../../src/services/tempo.js';

describe('[V-Model 1 · Unidade] Regra CLT Art. 66 — intervalo interjornada de 11h', () => {
  it('10h59min desde a última SAIDA → BLOQUEIA', () => {
    const av = avaliarInterjornada('2026-03-09 21:01:00', '2026-03-10 08:00:00');
    expect(av.conforme).toBe(false);
    expect(av.intervaloMinutos).toBe(659);
    expect(av.faltamMinutos).toBe(1);
  });

  it('11h00min exatos desde a última SAIDA → APROVA', () => {
    const av = avaliarInterjornada('2026-03-09 21:00:00', '2026-03-10 08:00:00');
    expect(av.conforme).toBe(true);
    expect(av.intervaloMinutos).toBe(660);
    expect(av.faltamMinutos).toBe(0);
  });

  it('10h59min59s ainda BLOQUEIA (comparação feita em segundos, sem arredondar a favor)', () => {
    expect(avaliarInterjornada('2026-03-09 21:00:01', '2026-03-10 08:00:00').conforme).toBe(false);
  });

  it('sem SAIDA anterior (primeira jornada) → APROVA', () => {
    expect(avaliarInterjornada(null, '2026-03-10 08:00:00')).toMatchObject({ conforme: true, intervaloMinutos: null });
  });

  it('atravessa virada de ano corretamente (20:00 de 31/12 → 07:00 de 01/01 = 11h)', () => {
    expect(avaliarInterjornada('2026-12-31 20:00:00', '2027-01-01 07:00:00').conforme).toBe(true);
    expect(avaliarInterjornada('2026-12-31 20:00:00', '2027-01-01 06:59:00').conforme).toBe(false);
  });

  it('ENTRADA anterior à última SAIDA (fora de ordem) é tratada como violação', () => {
    expect(avaliarInterjornada('2026-03-10 17:00:00', '2026-03-10 08:00:00').conforme).toBe(false);
  });
});

describe('[V-Model 1 · Unidade] Horas em DECIMAL(10,2) sem erro de ponto flutuante', () => {
  it('converte minutos inteiros em horas com 2 casas exatas (half-up por aritmética inteira)', () => {
    expect(minutosParaHorasDecimal(480)).toBe('8.00');
    expect(minutosParaHorasDecimal(487)).toBe('8.12'); // 8,1166… → 8.12
    expect(minutosParaHorasDecimal(485)).toBe('8.08'); // 8,0833… → 8.08
    expect(minutosParaHorasDecimal(10)).toBe('0.17');
    expect(minutosParaHorasDecimal(0)).toBe('0.00');
    expect(minutosParaHorasDecimal(-30)).toBe('-0.50');
  });

  it('6 min + 12 min = "0.30" exato, enquanto em float 0.1 + 0.2 ≠ 0.3', () => {
    expect(6 / 60 + 12 / 60).not.toBe(0.3); // 0.30000000000000004
    expect(somarIntervalosEmHoras([6, 12])).toBe('0.30');
  });

  it('soma os minutos ANTES de converter (3 × 10 min = "0.50", não 0.17 × 3 = 0.51)', () => {
    const arredondandoParcelas = [10, 10, 10].reduce((acc, m) => acc + Number(minutosParaHorasDecimal(m)), 0);
    expect(arredondandoParcelas.toFixed(2)).toBe('0.51');
    expect(somarIntervalosEmHoras([10, 10, 10])).toBe('0.50');
  });

  it('acumula 1.000 jornadas de 487 min sem deriva: 487000 min = "8116.67"', () => {
    expect(somarIntervalosEmHoras(Array.from({ length: 1000 }, () => 487))).toBe('8116.67');
  });

  it('rejeita minutos fracionários (a unidade de cálculo é sempre inteira)', () => {
    expect(() => minutosParaHorasDecimal(1.5)).toThrow();
  });

  it('pareia ENTRADA→SAIDA_ALMOCO e VOLTA_ALMOCO→SAIDA (mesma lógica da view)', () => {
    const minutos = calcularMinutosTrabalhados([
      { tipo_batida: 'SAIDA', data_hora_batida: '2026-03-10 17:07:00' },
      { tipo_batida: 'ENTRADA', data_hora_batida: '2026-03-10 08:00:00' },
      { tipo_batida: 'VOLTA_ALMOCO', data_hora_batida: '2026-03-10 13:00:00' },
      { tipo_batida: 'SAIDA_ALMOCO', data_hora_batida: '2026-03-10 12:00:00' },
    ]);
    expect(minutos).toBe(487);
    expect(minutosParaHorasDecimal(minutos)).toBe('8.12');
  });

  it('confiança facial normalizada para DECIMAL(5,2)', () => {
    expect(normalizarConfianca(97.456)).toBe(97.46);
    expect(normalizarConfianca(84.995)).toBe(85);
  });
});

describe('[V-Model 1 · Unidade] Normalização de data_hora_batida (horário original da captura)', () => {
  it('aceita formatos do campo e devolve o texto canônico do SGBD', () => {
    expect(normalizarDataHora('2026-11-24T08:00')).toBe('2026-11-24 08:00:00');
    expect(normalizarDataHora('2026-11-24 08:00:05')).toBe('2026-11-24 08:00:05');
    expect(normalizarDataHora('2026-11-24T08:00:05.123')).toBe('2026-11-24 08:00:05');
  });

  it('rejeita datas impossíveis ou mal formatadas', () => {
    expect(normalizarDataHora('2026-02-30 08:00:00')).toBeNull();
    expect(normalizarDataHora('24/11/2026 08:00')).toBeNull();
    expect(normalizarDataHora('')).toBeNull();
    expect(normalizarDataHora(123)).toBeNull();
  });
});
