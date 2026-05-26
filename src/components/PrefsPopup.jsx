import { THEMES } from '../ThemeContext.js';
import { PALETTES } from '../utils/colors.js';

function Slider({ label, value, min, max, step, onChange, fmt }) {
    return (
        <div className="prefs-section">
            <div className="prefs-row">
                <span className="prefs-section-label" style={{ marginBottom: 0 }}>{label}</span>
                <span className="prefs-value">{fmt ? fmt(value) : value}</span>
            </div>
            <input
                type="range" min={min} max={max} step={step}
                value={value}
                onChange={e => onChange(parseFloat(e.target.value))}
                className="prefs-slider"
            />
        </div>
    );
}

export default function PrefsPopup({
    open, onClose,
    theme, onTheme,
    regionAlpha, onAlpha,
    hoverScale, onHoverScale,
    dimScale, onDimScale,
    hoverDelay, onHoverDelay,
    focusZoom, onFocusZoom,
    watchdogEnabled, onWatchdogEnabled,
    watchdogModel, onWatchdogModel,
}) {
    if (!open) return null;

    const previewColor = PALETTES[theme]?.[0] ?? '#a78bfa';
    const previewAlphaHex = Math.round(regionAlpha * 255).toString(16).padStart(2, '0');

    return (
        <div className="prefs-overlay" onClick={onClose}>
            <div className="prefs-panel" onClick={e => e.stopPropagation()}>

                <div className="prefs-header">
                    <span className="prefs-title">preferences</span>
                    <button className="prefs-close" onClick={onClose}>×</button>
                </div>

                <div className="prefs-body">

                    {/* Theme */}
                    <div className="prefs-section">
                        <div className="prefs-section-label">color theme</div>
                        <div className="prefs-themes">
                            {THEMES.map(t => (
                                <button
                                    key={t}
                                    className={`prefs-theme-card${theme === t ? ' prefs-theme-card--active' : ''}`}
                                    onClick={() => onTheme(t)}
                                >
                                    <span className="prefs-theme-name">{t}</span>
                                    <div className="prefs-swatches">
                                        {(PALETTES[t] ?? []).map(c => (
                                            <span key={c} className="prefs-swatch" style={{ background: c }} />
                                        ))}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Region fill opacity */}
                    <div className="prefs-section">
                        <div className="prefs-row">
                            <span className="prefs-section-label" style={{ marginBottom: 0 }}>region fill opacity</span>
                            <span className="prefs-value">{Math.round(regionAlpha * 100)}%</span>
                        </div>
                        <input
                            type="range" min="0" max="50" step="1"
                            value={Math.round(regionAlpha * 100)}
                            onChange={e => onAlpha(parseInt(e.target.value) / 100)}
                            className="prefs-slider"
                        />
                        <div
                            className="prefs-alpha-preview"
                            style={{ background: previewColor + previewAlphaHex, borderColor: previewColor + 'a0' }}
                        >
                            <span style={{ color: previewColor, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                sample region
                            </span>
                        </div>
                    </div>

                    <Slider label="hover scale" value={hoverScale} min={1.0} max={1.6} step={0.05} onChange={onHoverScale} fmt={v => `${Math.round(v * 100)}%`} />
                    <Slider label="dim scale" value={dimScale} min={0.4} max={1.0} step={0.05} onChange={onDimScale} fmt={v => `${Math.round(v * 100)}%`} />
                    <Slider label="hover delay" value={hoverDelay} min={0} max={800} step={50} onChange={v => onHoverDelay(Math.round(v))} fmt={v => `${v}ms`} />
                    <Slider label="focus zoom (⌥F)" value={focusZoom} min={50} max={150} step={5} onChange={onFocusZoom} fmt={v => `${v}%`} />

                    {/* LSP Watchdog */}
                    <div className="prefs-section">
                        <div className="prefs-row">
                            <span className="prefs-section-label" style={{ marginBottom: 0 }}>LSP watchdog</span>
                            <button
                                className={`prefs-toggle${watchdogEnabled ? ' prefs-toggle--on' : ''}`}
                                onClick={() => onWatchdogEnabled(!watchdogEnabled)}
                            >
                                {watchdogEnabled ? 'on' : 'off'}
                            </button>
                        </div>
                        {watchdogEnabled && (
                            <input
                                className="prefs-model-input"
                                type="text"
                                placeholder="model override (blank = agent default)"
                                value={watchdogModel}
                                onChange={e => onWatchdogModel(e.target.value)}
                                spellCheck={false}
                            />
                        )}
                    </div>

                </div>{/* prefs-body */}
            </div>
        </div>
    );
}
