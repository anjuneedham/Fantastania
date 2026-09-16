/**
 * Platform glue: Capacitor/Android integration, orientation handling and the
 * hardware back button. Everything here degrades to a no-op in a plain browser,
 * so the same build runs in both places.
 */

type BackHandler = () => boolean;

interface CapacitorApp {
  addListener(
    event: 'backButton',
    handler: (data: { canGoBack: boolean }) => void,
  ): Promise<{ remove: () => void }>;
  exitApp(): Promise<void>;
  addListener(
    event: 'appStateChange',
    handler: (state: { isActive: boolean }) => void,
  ): Promise<{ remove: () => void }>;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: {
    App?: CapacitorApp;
    StatusBar?: { hide(): Promise<void>; setOverlaysWebView(o: { overlay: boolean }): Promise<void> };
    ScreenOrientation?: { lock(o: { orientation: string }): Promise<void> };
    SplashScreen?: { hide(): Promise<void> };
  };
}

function cap(): CapacitorGlobal | undefined {
  return (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
}

export function isNative(): boolean {
  return cap()?.isNativePlatform?.() === true;
}

export function platformName(): string {
  return cap()?.getPlatform?.() ?? 'web';
}

/**
 * Wires the Android hardware back button to the scene stack. Returning false
 * from the handler lets the OS close the app, which is the behaviour Play Store
 * reviewers expect from the top-level screen.
 */
export async function installBackHandler(handler: BackHandler): Promise<void> {
  const app = cap()?.Plugins?.App;
  if (app) {
    await app.addListener('backButton', () => {
      if (!handler()) void app.exitApp();
    });
    return;
  }

  // Browser fallback: push a history entry and intercept popstate, so the
  // browser back button closes menus instead of leaving the game.
  history.pushState({ fantastania: true }, '');
  window.addEventListener('popstate', () => {
    handler();
    history.pushState({ fantastania: true }, '');
  });
}

/** Locks to landscape where the platform allows it. Never fatal. */
export async function lockLandscape(): Promise<void> {
  const plugin = cap()?.Plugins?.ScreenOrientation;
  if (plugin) {
    try {
      await plugin.lock({ orientation: 'landscape' });
      return;
    } catch {
      /* fall through to the web API */
    }
  }
  const so = (screen as unknown as { orientation?: { lock?: (o: string) => Promise<void> } })
    .orientation;
  try {
    await so?.lock?.('landscape');
  } catch {
    // Browsers reject this outside fullscreen. The CSS rotate hint covers it.
  }
}

export async function hideNativeChrome(): Promise<void> {
  const plugins = cap()?.Plugins;
  try {
    await plugins?.StatusBar?.setOverlaysWebView({ overlay: true });
    await plugins?.StatusBar?.hide();
    await plugins?.SplashScreen?.hide();
  } catch {
    /* not native */
  }
}

/** Notifies when the app is backgrounded, so audio and the loop can pause. */
export async function onAppStateChange(handler: (active: boolean) => void): Promise<void> {
  const app = cap()?.Plugins?.App;
  if (app) {
    await app.addListener('appStateChange', ({ isActive }) => handler(isActive));
  }
  document.addEventListener('visibilitychange', () => handler(!document.hidden));
}

/** Marks the body so the CSS portrait hint only appears on phone-sized screens. */
export function watchOrientation(): void {
  const update = () => {
    const isPhoneSized = Math.min(window.innerWidth, window.innerHeight) < 560;
    document.body.classList.toggle('needs-landscape', isPhoneSized);
  };
  update();
  window.addEventListener('resize', update);
  window.addEventListener('orientationchange', update);
}

/** Requests fullscreen; browsers require this to originate from a gesture. */
export async function requestFullscreen(): Promise<void> {
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
  } catch {
    /* denied; not important */
  }
}
