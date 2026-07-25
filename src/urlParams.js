export const USER_PREVIEW_URL_PARAMS = ['distance', 'quality', 'paused'];
export const DEV_PREVIEW_URL_PARAMS = ['fov', 'portal'];

export function isLocalPreviewHost(hostname) {
  return hostname === '127.0.0.1' || hostname === 'localhost';
}

export function allowPreviewUrlParams() {
  return import.meta.env.DEV || isLocalPreviewHost(window.location.hostname);
}

export function filterUrlParams(search, allowedParams) {
  const source = new URLSearchParams(search);
  const filtered = new URLSearchParams();
  for (const key of allowedParams) {
    if (source.has(key)) {
      filtered.set(key, source.get(key));
    }
  }
  return filtered;
}

export function getPreviewUrlParams() {
  return allowPreviewUrlParams()
    ? filterUrlParams(window.location.search, USER_PREVIEW_URL_PARAMS)
    : new URLSearchParams();
}

export function getDevPreviewUrlParams() {
  return allowPreviewUrlParams()
    ? filterUrlParams(window.location.search, DEV_PREVIEW_URL_PARAMS)
    : new URLSearchParams();
}

export function updateUrlParams(updates) {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined) {
      url.searchParams.delete(key);
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  window.history.replaceState({}, '', url);
}
