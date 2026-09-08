export type BenchmarkCase = {
  id: string;
  expected: 'ADMISSIBLE_WITHIN_DECLARED_MODEL' | 'REJECTED' | 'INSUFFICIENT_EVIDENCE';
  description: string;
};
export const benchmarkCase = (
  id: string,
  expected: BenchmarkCase['expected'],
  description: string,
): BenchmarkCase => ({ id, expected, description });
