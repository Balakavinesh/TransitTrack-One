import { RULES, type RuleCode, type Severity } from './rules/catalog.js';

export interface FindingSample {
  file?: string;
  /** 1-based line number in the file (header is line 1). */
  row?: number;
  message: string;
}

export interface Finding {
  code: RuleCode;
  severity: Severity;
  title: string;
  /** Total occurrences; only the first `samples.length` are kept. */
  count: number;
  samples: FindingSample[];
}

export type ValidationStatus = 'passed' | 'passed_with_warnings' | 'failed';

/**
 * Aggregates findings by rule code. A feed with a million identical problems keeps a count
 * and a handful of examples rather than a million objects.
 */
export class FindingCollector {
  private readonly byCode = new Map<RuleCode, Finding>();

  constructor(private readonly maxSamples = 20) {}

  add(code: RuleCode, sample: FindingSample, occurrences = 1): void {
    let finding = this.byCode.get(code);
    if (!finding) {
      const rule = RULES[code];
      finding = { code, severity: rule.severity, title: rule.title, count: 0, samples: [] };
      this.byCode.set(code, finding);
    }
    finding.count += occurrences;
    if (finding.samples.length < this.maxSamples) finding.samples.push(sample);
  }

  count(code: RuleCode): number {
    return this.byCode.get(code)?.count ?? 0;
  }

  /** Errors first, then warnings; within a severity, by catalog order. */
  list(): Finding[] {
    const order = Object.keys(RULES);
    return [...this.byCode.values()].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  }

  status(): ValidationStatus {
    const findings = [...this.byCode.values()];
    if (findings.some((f) => f.severity === 'error')) return 'failed';
    if (findings.length > 0) return 'passed_with_warnings';
    return 'passed';
  }
}
