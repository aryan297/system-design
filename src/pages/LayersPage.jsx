import { useState } from "react";
import { DESIGN_LAYERS } from "../data/layers";
import { LAYER_DETAILS } from "../data/layerDetails";
import "./LayersPage.css";

function FlowDiagram({ steps, color }) {
  return (
    <div className="lp-flow">
      {steps.map((step, i) => (
        <span key={i} className="lp-flow-row">
          <span className="lp-flow-box" style={{ borderColor: `${color}44`, color }}>
            {step}
          </span>
          {i < steps.length - 1 && <span className="lp-flow-arrow">→</span>}
        </span>
      ))}
    </div>
  );
}

function DeepDive({ sections, color }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="lp-deepdive">
      <button
        className="lp-deepdive-toggle"
        style={{ color, borderColor: `${color}33` }}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lp-deepdive-icon">{open ? "▾" : "▸"}</span>
        {open ? "Hide deep dive" : "Deep dive"}
        <span className="lp-deepdive-count">{sections.length} sections</span>
      </button>

      {open && (
        <div className="lp-deepdive-body">
          {sections.map((s, i) => (
            <div key={i} className="lp-deepdive-section">
              <h4 className="lp-deepdive-heading" style={{ color }}>
                {s.heading}
              </h4>
              <p className="lp-deepdive-body-text">{s.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BriefPanel({ brief, color }) {
  return (
    <div className="lp-brief">
      {brief.what && (
        <div className="lp-brief-row">
          <span className="lp-brief-label" style={{ color }}>What</span>
          <p className="lp-brief-text">{brief.what}</p>
        </div>
      )}
      {brief.why && (
        <div className="lp-brief-row">
          <span className="lp-brief-label" style={{ color }}>Why it matters</span>
          <p className="lp-brief-text">{brief.why}</p>
        </div>
      )}
      {brief.how && (
        <div className="lp-brief-row">
          <span className="lp-brief-label" style={{ color }}>How it works</span>
          <p className="lp-brief-text">{brief.how}</p>
        </div>
      )}
      {brief.tradeoffs && (
        <div className="lp-brief-row">
          <span className="lp-brief-label" style={{ color }}>Trade-offs</span>
          <p className="lp-brief-text">{brief.tradeoffs}</p>
        </div>
      )}
      {brief.example && (
        <div className="lp-brief-row lp-brief-example">
          <span className="lp-brief-label" style={{ color: "#14b8a6" }}>Real example</span>
          <p className="lp-brief-text">{brief.example}</p>
        </div>
      )}
      {brief.interview && (
        <div className="lp-brief-row lp-brief-interview">
          <span className="lp-brief-label">Interview tip</span>
          <p className="lp-brief-text">{brief.interview}</p>
        </div>
      )}
    </div>
  );
}

function TopicCard({ topic, color }) {
  const details = LAYER_DETAILS[topic.id];
  return (
    <div className="lp-topic">
      <span className="lp-topic-tag" style={{ color, background: `${color}18` }}>
        {topic.tag}
      </span>
      <h3 className="lp-topic-title" style={{ color: `${color}dd` }}>
        {topic.title}
      </h3>
      <div className="lp-topic-divider" style={{ background: color }} />
      <p className="lp-topic-desc">{topic.description}</p>

      {topic.concepts && (
        <div className="lp-concept-grid">
          {topic.concepts.map((c, i) => (
            <div key={i} className="lp-concept-item">
              <strong style={{ color }}>{c.label}</strong>
              <span>{c.text}</span>
            </div>
          ))}
        </div>
      )}

      {topic.flow && <FlowDiagram steps={topic.flow} color={color} />}

      {topic.points && (
        <ul className="lp-points">
          {topic.points.map((pt, i) => (
            <li key={i}>{pt}</li>
          ))}
        </ul>
      )}

      {topic.brief && <BriefPanel brief={topic.brief} color={color} />}

      {details && <DeepDive sections={details} color={color} />}
    </div>
  );
}

function LayerSection({ layer, isOpen, onToggle }) {
  return (
    <section className="lp-layer" id={layer.id}>
      <button
        className="lp-layer-header"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="lp-layer-num">{layer.num}</span>
        <h2 className="lp-layer-title" style={{ color: layer.color }}>
          {layer.title}
        </h2>
        <span className="lp-layer-count">{layer.topics.length} topics</span>
        <span
          className="lp-layer-chevron"
          style={{ color: layer.color, transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="lp-layer-body">
          {layer.topics.map((topic) => (
            <TopicCard key={topic.id} topic={topic} color={layer.color} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function LayersPage() {
  const [openLayers, setOpenLayers] = useState(
    Object.fromEntries(DESIGN_LAYERS.map((l) => [l.id, true]))
  );

  const toggle = (id) =>
    setOpenLayers((prev) => ({ ...prev, [id]: !prev[id] }));

  const allOpen = Object.values(openLayers).every(Boolean);
  const toggleAll = () =>
    setOpenLayers(Object.fromEntries(DESIGN_LAYERS.map((l) => [l.id, !allOpen])));

  const totalTopics = DESIGN_LAYERS.reduce((s, l) => s + l.topics.length, 0);

  return (
    <div className="lp-page">
      <header className="lp-header">
        <p className="lp-eyebrow">Complete Study Notes</p>
        <h1 className="lp-title">
          Layers of <em>System Design</em>
        </h1>
        <p className="lp-subtitle">
          {totalTopics} topics · {DESIGN_LAYERS.length} layers · from surface to core
        </p>
      </header>

      <nav className="lp-nav">
        {DESIGN_LAYERS.map((l) => (
          <a
            key={l.id}
            href={`#${l.id}`}
            className="lp-nav-pill"
            style={{ color: l.color, borderColor: `${l.color}44` }}
            onClick={(e) => {
              e.preventDefault();
              setOpenLayers((prev) => ({ ...prev, [l.id]: true }));
              document.getElementById(l.id)?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            Layer {l.num} · {l.title}
          </a>
        ))}
      </nav>

      <div className="lp-controls">
        <button className="lp-toggle-all" onClick={toggleAll}>
          {allOpen ? "Collapse all" : "Expand all"}
        </button>
      </div>

      <main className="lp-main">
        {DESIGN_LAYERS.map((layer) => (
          <LayerSection
            key={layer.id}
            layer={layer}
            isOpen={openLayers[layer.id]}
            onToggle={() => toggle(layer.id)}
          />
        ))}
      </main>
    </div>
  );
}
