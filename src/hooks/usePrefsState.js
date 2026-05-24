import { useState, useEffect } from 'react';

export function usePrefsState() {
  const [theme,       setTheme]       = useState(() => localStorage.getItem('theme') || 'dark');
  const [regionAlpha, setRegionAlpha] = useState(() => parseFloat(localStorage.getItem('regionAlpha') ?? '0.05'));
  const [hoverScale,  setHoverScale]  = useState(() => parseFloat(localStorage.getItem('hoverScale')  ?? '1.2'));
  const [dimScale,    setDimScale]    = useState(() => parseFloat(localStorage.getItem('dimScale')    ?? '0.8'));
  const [hoverDelay,  setHoverDelay]  = useState(() => parseInt(localStorage.getItem('hoverDelay')   ?? '200', 10));
  const [focusZoom,   setFocusZoom]   = useState(() => parseFloat(localStorage.getItem('focusZoom')  ?? '100'));

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem('regionAlpha', regionAlpha);
    localStorage.setItem('hoverScale',  hoverScale);
    localStorage.setItem('dimScale',    dimScale);
    localStorage.setItem('hoverDelay',  hoverDelay);
    localStorage.setItem('focusZoom',   focusZoom);
  }, [regionAlpha, hoverScale, dimScale, hoverDelay, focusZoom]);

  useEffect(() => {
    document.body.style.setProperty('--hover-scale', hoverScale);
    document.body.style.setProperty('--dim-scale',   dimScale);
  }, [hoverScale, dimScale]);

  return {
    theme,       setTheme,
    regionAlpha, setRegionAlpha,
    hoverScale,  setHoverScale,
    dimScale,    setDimScale,
    hoverDelay,  setHoverDelay,
    focusZoom,   setFocusZoom,
  };
}
