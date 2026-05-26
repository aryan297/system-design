import { useParams, useNavigate, NavLink } from "react-router-dom";
import { MC_CATEGORIES } from "../data/machineCoding";
import CodeBlock from "../components/CodeBlock";
import "./MachineCodingPage.css";

const DIFF_CLASS = { Easy: "mc-diff-easy", Medium: "mc-diff-medium", Hard: "mc-diff-hard" };

export default function MachineCodingPage() {
  const { categoryId, problemId } = useParams();
  const navigate = useNavigate();

  const category = MC_CATEGORIES.find((c) => c.id === categoryId);
  const problem = category?.problems.find((p) => p.id === problemId);

  if (!category || !problem) {
    const first = MC_CATEGORIES[0];
    navigate(`/machine-coding/${first.id}/${first.problems[0].id}`, { replace: true });
    return null;
  }

  return (
    <div className="mc-layout">
      {/* ── Left panel ── */}
      <aside className="mc-panel">
        <div className="mc-panel-header">
          <span className="mc-panel-icon">⌨️</span>
          <div>
            <div className="mc-panel-title">Machine Coding</div>
            <div className="mc-panel-sub">
              {MC_CATEGORIES.reduce((s, c) => s + c.problems.length, 0)} problems · Go
            </div>
          </div>
        </div>

        {MC_CATEGORIES.map((cat) => {
          const isOpen = cat.id === categoryId;
          return (
            <div key={cat.id} className="mc-cat">
              <NavLink
                to={`/machine-coding/${cat.id}/${cat.problems[0].id}`}
                className={`mc-cat-header ${isOpen ? "mc-cat-header--open" : ""}`}
              >
                <span className="mc-cat-icon">{cat.icon}</span>
                <span className="mc-cat-title">{cat.title}</span>
                <span className="mc-cat-chevron">{isOpen ? "▾" : "▸"}</span>
              </NavLink>

              {isOpen && (
                <div className="mc-problem-list">
                  {cat.problems.map((p, idx) => (
                    <NavLink
                      key={p.id}
                      to={`/machine-coding/${cat.id}/${p.id}`}
                      className={({ isActive }) =>
                        `mc-problem-item ${isActive ? "mc-problem-item--active" : ""}`
                      }
                    >
                      <span className="mc-problem-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="mc-problem-name">{p.title}</span>
                      <span className={`mc-diff ${DIFF_CLASS[p.difficulty]}`}>
                        {p.difficulty}
                      </span>
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </aside>

      {/* ── Right panel ── */}
      <main className="mc-detail">
        {/* Header */}
        <div className="mc-detail-header">
          <div className="mc-detail-meta">
            <span className="mc-badge">Machine Coding</span>
            <span className={`mc-diff mc-diff--lg ${DIFF_CLASS[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
            <span className="mc-lang-badge">Go</span>
          </div>
          <h1 className="mc-detail-title">{problem.title}</h1>
          <p className="mc-detail-desc">{problem.description}</p>
        </div>

        {/* Requirements */}
        <section className="mc-section">
          <h2 className="mc-section-title">Requirements</h2>
          <ul className="mc-requirements">
            {problem.requirements.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </section>

        {/* Key Concepts */}
        <section className="mc-section">
          <h2 className="mc-section-title">Key Concepts</h2>
          <div className="mc-concepts">
            {problem.concepts.map((c, i) => (
              <span key={i} className="mc-concept-tag">{c}</span>
            ))}
          </div>
        </section>

        {/* Approach */}
        <section className="mc-section">
          <h2 className="mc-section-title">Design &amp; Approach</h2>
          <p className="mc-approach">{problem.approach}</p>
        </section>

        {/* Code */}
        <section className="mc-section">
          <h2 className="mc-section-title">Go Implementation</h2>
          <CodeBlock code={problem.code} label="Go" />
        </section>
      </main>
    </div>
  );
}
