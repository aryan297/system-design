import "./MetricsTable.css";

export default function MetricsTable({ metrics }) {
  return (
    <div className="metrics-table">
      {metrics.map((m, i) => (
        <div key={i} className="metrics-row">
          <span className="metrics-label">{m.label}</span>
          <span className="metrics-value">{m.value}</span>
          {m.note && <span className="metrics-note">{m.note}</span>}
        </div>
      ))}
    </div>
  );
}
