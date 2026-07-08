/**
 * Pure decision function: given how long an upload has been processing and
 * the configured budget, decide whether it should be aborted. Kept separate
 * from the (impure) act of reading the clock so it's trivially testable with
 * plain numbers -- no fake timers, no real waiting, no flakiness.
 */
export function isOverBudget(elapsedMs: number, budgetMs: number): boolean {
  return elapsedMs > budgetMs;
}
