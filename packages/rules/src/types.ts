/**
 * Rule engine types
 */

export type RuleSeverity = 'error' | 'warning' | 'info';

export interface RuleResult {
  ruleCode: string;
  severity: RuleSeverity;
  message: string;
  deviceTag?: string;
  netId?: string;
  suggestedFix?: string;
}

export interface ValidationReport {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  results: RuleResult[];
  generatedAt: number;
}
