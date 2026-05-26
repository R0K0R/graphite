const KIND_LABEL = { 5:'cls', 6:'mth', 9:'ctor', 10:'enum', 11:'iface', 12:'fn', 13:'var', 14:'const' };
const KIND_COLOR = { 5:'#60a5fa', 6:'#a78bfa', 9:'#f472b6', 10:'#fb923c', 11:'#34d399', 12:'#a78bfa', 13:'#94a3b8', 14:'#fbbf24' };

export default function SymbolCard({ data, selected }) {
  const { symbolName, symbolKind, detail, filePath, refCount } = data;
  const color = KIND_COLOR[symbolKind] ?? '#a78bfa';
  const label = KIND_LABEL[symbolKind] ?? 'sym';
  return (
    <div className={`symbol-card${selected ? ' symbol-card--selected' : ''}`} style={{ borderColor: color }}>
      <div className="symbol-card-header">
        <span className="symbol-card-kind" style={{ color }}>{label}</span>
        <span className="symbol-card-name">{symbolName}</span>
        {refCount != null && <span className="symbol-card-refs">{refCount} refs</span>}
      </div>
      {detail && <div className="symbol-card-detail">{detail}</div>}
      <div className="symbol-card-file">{filePath?.split('/').pop()}</div>
    </div>
  );
}
