export class ProjectLimitError extends Error {
  currentCount: number;
  maxAllowed: number;

  constructor(currentCount: number, maxAllowed: number) {
    super(`Project limit reached: ${currentCount}/${maxAllowed}`);
    this.name = 'ProjectLimitError';
    this.currentCount = currentCount;
    this.maxAllowed = maxAllowed;
  }
}
