export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Случайное целое в диапазоне [min, max] включительно. */
export function randomInt(min: number, max: number): number {
  const low = Math.ceil(min);
  const high = Math.floor(max);
  if (high < low) {
    throw new Error(`Некорректный диапазон: ${min}..${max}`);
  }
  return Math.floor(Math.random() * (high - low + 1)) + low;
}

export function sleepRandom(min: number, max: number): Promise<void> {
  return sleep(randomInt(min, max));
}
