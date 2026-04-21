import "./PageHeader.css";

export default function PageHeader({ icon, title, subtitle, type }) {
  return (
    <div className="page-header">
      <div className="page-header-top">
        <span className="page-header-icon">{icon}</span>
        <span className={`badge ${type === "HLD" ? "badge-accent" : "badge-red"}`}>{type}</span>
      </div>
      <h1 className="page-header-title">{title}</h1>
      {subtitle && <p className="page-header-subtitle">{subtitle}</p>}
    </div>
  );
}
