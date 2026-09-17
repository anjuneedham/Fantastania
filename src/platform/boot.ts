/**
 * Loading-screen control. Kept in the platform layer because it talks to the
 * static DOM in index.html, which the game itself never touches.
 */
const el = {
  root: () => document.getElementById('boot'),
  fill: () => document.getElementById('boot-fill'),
  status: () => document.getElementById('boot-status'),
  error: () => document.getElementById('boot-error'),
};

export function bootProgress(fraction: number, message?: string): void {
  const fill = el.fill();
  if (fill) fill.style.width = `${Math.round(Math.max(0.05, Math.min(1, fraction)) * 100)}%`;
  if (message) {
    const status = el.status();
    if (status) status.textContent = message;
  }
}

export async function bootComplete(): Promise<void> {
  bootProgress(1, 'Ready');
  const root = el.root();
  if (!root) return;
  // One frame at 100% before fading, so the bar never appears to skip.
  await new Promise((r) => setTimeout(r, 180));
  root.classList.add('done');
  setTimeout(() => root.remove(), 700);
}

/** Shows a fatal error in place of the loading screen. */
export function bootError(err: unknown): void {
  const message = err instanceof Error ? `${err.message}\n\n${err.stack ?? ''}` : String(err);
  const status = el.status();
  if (status) status.textContent = 'Failed to start';
  const box = el.error();
  if (box) {
    box.hidden = false;
    box.textContent = message;
  }
  const fill = el.fill();
  if (fill) fill.style.background = '#e0455e';
  console.error('[boot]', err);
}
