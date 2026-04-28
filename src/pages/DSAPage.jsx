import { useParams, useNavigate, NavLink } from "react-router-dom";
import { DSA_CATEGORIES } from "../data/dsa";
import CodeBlock from "../components/CodeBlock";
import gopherImg from "../assets/gopher.png";
import "./DSAPage.css";

const DIFF_CLASS = { Easy: "diff-easy", Medium: "diff-medium", Hard: "diff-hard" };

export default function DSAPage() {
  const { categoryId, problemId } = useParams();
  const navigate = useNavigate();

  const category = DSA_CATEGORIES.find((c) => c.id === categoryId);
  const problem = category?.problems.find((p) => p.id === problemId);

  // Redirect to first problem if params are missing/invalid
  if (!category || !problem) {
    const first = DSA_CATEGORIES[0];
    navigate(`/dsa/${first.id}/${first.problems[0].id}`, { replace: true });
    return null;
  }

  return (
    <div className="dsa-layout">
      {/* Left panel — category + problem list */}
      <aside className="dsa-panel">
        <div className="dsa-panel-header">
          <img src={gopherImg} alt="Go Gopher" className="dsa-panel-gopher" />
          <div>
            <div className="dsa-panel-title">DSA in Go</div>
            <div className="dsa-panel-sub">{DSA_CATEGORIES.length} categories</div>
          </div>
        </div>
        {DSA_CATEGORIES.map((cat) => {
          const isOpen = cat.id === categoryId;
          return (
            <div key={cat.id} className="dsa-cat">
              <NavLink
                to={`/dsa/${cat.id}/${cat.problems[0].id}`}
                className={`dsa-cat-header ${isOpen ? "dsa-cat-header--open" : ""}`}
              >
                <span className="dsa-cat-icon">{cat.icon}</span>
                <span className="dsa-cat-title">{cat.title}</span>
                <span className="dsa-cat-chevron">{isOpen ? "▾" : "▸"}</span>
              </NavLink>

              {isOpen && (
                <div className="dsa-problem-list">
                  {cat.problems.map((p, idx) => (
                    <NavLink
                      key={p.id}
                      to={`/dsa/${cat.id}/${p.id}`}
                      className={({ isActive }) =>
                        `dsa-problem-item ${isActive ? "dsa-problem-item--active" : ""}`
                      }
                    >
                      <span className="dsa-problem-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="dsa-problem-name">{p.title}</span>
                      <span className={`dsa-diff ${DIFF_CLASS[p.difficulty]}`}>
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

      {/* Right panel — problem detail */}
      <main className="dsa-detail">
        {/* Header */}
        <div className="dsa-detail-header">
          <div className="dsa-detail-meta">
            <span className="dsa-lc-badge">LC #{problem.leetcode}</span>
            <span className={`dsa-diff dsa-diff--lg ${DIFF_CLASS[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
            <span className="dsa-lang-badge">
              <img src={gopherImg} alt="Go" className="dsa-gopher" />
              Go
            </span>
          </div>
          <h1 className="dsa-detail-title">{problem.title}</h1>
          <p className="dsa-detail-desc">{problem.description}</p>
        </div>

        {/* Examples */}
        <section className="dsa-section">
          <h2 className="dsa-section-title">Examples</h2>
          <div className="dsa-examples">
            {problem.examples.map((ex, i) => (
              <div key={i} className="dsa-example">
                <div className="dsa-io-row">
                  <span className="dsa-io-label">Input</span>
                  <code className="dsa-io-value">{ex.input}</code>
                </div>
                <div className="dsa-io-row">
                  <span className="dsa-io-label">Output</span>
                  <code className="dsa-io-value">{ex.output}</code>
                </div>
                {ex.explanation && (
                  <div className="dsa-io-row">
                    <span className="dsa-io-label">Why</span>
                    <span className="dsa-io-explain">{ex.explanation}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Approach */}
        <section className="dsa-section">
          <h2 className="dsa-section-title">Logic &amp; Approach</h2>
          <p className="dsa-approach">{problem.approach}</p>
          <div className="dsa-complexity">
            <div className="dsa-complexity-chip">
              <span className="dsa-complexity-label">Time</span>
              <code className="dsa-complexity-val">{problem.complexity.time}</code>
            </div>
            <div className="dsa-complexity-chip">
              <span className="dsa-complexity-label">Space</span>
              <code className="dsa-complexity-val">{problem.complexity.space}</code>
            </div>
          </div>
        </section>

        {/* Code */}
        <section className="dsa-section">
          <h2 className="dsa-section-title">Go Solution</h2>
          <CodeBlock code={problem.code} label="Go" />
        </section>
      </main>
    </div>
  );
}
