import { useState } from "react";
import { useParams, Navigate } from "react-router-dom";
import { getSystem } from "../data/index";
import PageHeader from "../components/PageHeader";
import SectionCard from "../components/SectionCard";
import CodeBlock from "../components/CodeBlock";
import ContentText from "../components/ContentText";
import "./SystemLLD.css";

export default function SystemLLD() {
  const { systemId } = useParams();
  const system = getSystem(systemId);

  const [activeComp, setActiveComp] = useState(system?.lld?.components?.[0]?.id ?? "");

  if (!system) return <Navigate to="/" replace />;

  const { lld, meta } = system;
  const current = lld.components.find((c) => c.id === activeComp) ?? lld.components[0];

  return (
    <div className="lld-page">
      <PageHeader icon={meta.icon} title={lld.title} subtitle={lld.subtitle} type="LLD" />

      <div className="lld-layout">
        {/* Left — component list */}
        <div className="lld-sidebar">
          <p className="lld-sidebar-label">Components</p>
          {lld.components.map((c) => (
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

        {/* Right — detail */}
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
