import "./SectionCard.css";

export default function SectionCard({ title, children, accent }) {
  return (
    <div className={`section-card ${accent ? "section-card--accent" : ""}`}>
      {title && <h3 className="section-card-title">{title}</h3>}
      <div className="section-card-body">{children}</div>
    </div>
  );
}
