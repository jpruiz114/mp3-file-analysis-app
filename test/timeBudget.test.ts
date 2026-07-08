import { isOverBudget } from '../src/timeBudget';

describe('isOverBudget', () => {
  it('returns false when elapsed time is under the budget', () => {
    expect(isOverBudget(100, 5000)).toBe(false);
  });

  it('returns false when elapsed time exactly equals the budget', () => {
    expect(isOverBudget(5000, 5000)).toBe(false);
  });

  it('returns true when elapsed time exceeds the budget', () => {
    expect(isOverBudget(5001, 5000)).toBe(true);
  });

  it('returns true for a budget of 0 as soon as any time has elapsed', () => {
    expect(isOverBudget(1, 0)).toBe(true);
  });

  it('returns false for a budget of 0 with zero elapsed time', () => {
    expect(isOverBudget(0, 0)).toBe(false);
  });
});
