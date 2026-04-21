import { useState } from "react";
import { NETFLIX_LLD } from "../data/netflix";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import CodeBlock from "../components/CodeBlock";
import ContentText from "../components/ContentText";
import "./NetflixLLD.css";

export default function NetflixLLD() {
  const [activeComp, setActiveComp] = useState(NETFLIX_LLD.components[0].id);
  const current = NETFLIX_LLD.components.find((c) => c.id === activeComp);

  return (
    <div className="lld-page">
      <PageHeader
        icon="🎬"
        title={NETFLIX_LLD.title}
        subtitle={NETFLIX_LLD.subtitle}
        type="LLD"
      />

      <div className="lld-layout">
        {/* Component list */}
        <div className="lld-sidebar">
          <p className="lld-sidebar-label">Components</p>
          {NETFLIX_LLD.components.map((c) => (
            <button
              key={c.id}
              className={`lld-comp-btn ${activeComp === c.id ? "active" : ""}`}
              onClick={() => setActiveComp(c.id)}
            >
              <span className="lld-comp-name">{c.title}</span>
              <span className="lld-comp-desc">{c.description}</span>
            </button>
          ))}
        </div>

        {/* Component detail */}
        <div className="lld-detail">
          <div className="lld-detail-header">
            <span className="badge badge-red">LLD</span>
            <h2 className="lld-detail-title">{current.title}</h2>
            <p className="lld-detail-desc">{current.description}</p>
          </div>

          <div className="lld-detail-body">
            <SectionCard title="API / Schema Design">
              <CodeBlock code={current.api} label="schema / api" />
            </SectionCard>

            <SectionCard title="Internal Design & Algorithms">
              <ContentText text={current.internals} />
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
