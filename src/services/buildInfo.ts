// The build's identity (commit, build time, version) is written into index.html at build time
// (vite.config.ts, version-json-plugin), not compiled into the JS: a constant that changes on
// every build changed the entry chunk, and through its imports the file name of every page
// chunk, so each deploy made clients download the whole app again. The page and its scripts
// always come from the same build, so the value means exactly what the compiled one did.
export interface BuildInfo {
  commit?: string;
  buildTime?: string;
  version?: string;
}

export function readBuildInfo(): BuildInfo {
  if (typeof document === 'undefined') return {};
  const raw = document.querySelector('meta[name="app-build"]')?.getAttribute('content');
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as BuildInfo;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}
