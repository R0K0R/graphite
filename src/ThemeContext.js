import { createContext, useContext } from 'react';

export const THEMES = ['dark', 'light', 'gruvbox', 'tokyo-night'];

export const PrefsContext = createContext({ theme: 'dark', regionAlpha: 0.05, hoverScale: 1.2, dimScale: 0.8, hoverDelay: 200, focusZoom: 100, watchdogEnabled: true, watchdogModel: '' });

export function usePrefs() {
  return useContext(PrefsContext);
}
