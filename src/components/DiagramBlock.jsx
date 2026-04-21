import "./DiagramBlock.css";

export default function DiagramBlock({ diagram, title }) {
  return (
    <div className="diagram-block">
      {title && <p className="diagram-title">{title}</p>}
      <pre className="diagram-pre">{diagram}</pre>
    </div>
  );
}
