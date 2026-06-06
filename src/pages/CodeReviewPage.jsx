import { useParams, useNavigate, NavLink } from "react-router-dom";
import { CR_CATEGORIES } from "../data/codeReview";
import CodeBlock from "../components/CodeBlock";
import "./CodeReviewPage.css";

const DIFF_CLASS = { Easy: "cr-diff-easy", Medium: "cr-diff-medium", Hard: "cr-diff-hard" };
const SEV_CLASS = { Critical: "cr-sev-critical", High: "cr-sev-high", Medium: "cr-sev-medium" };

export default function CodeReviewPage() {
  const { categoryId, problemId } = useParams();
  const navigate = useNavigate();

  const category = CR_CATEGORIES.find((c) => c.id === categoryId);
  const problem = category?.problems.find((p) => p.id === problemId);

  if (!category || !problem) {
    const first = CR_CATEGORIES[0];
    navigate(`/code-review/${first.id}/${first.problems[0].id}`, { replace: true });
    return null;
  }

  return (
    <div className="cr-layout">
      {/* ── Left panel ── */}
      <aside className="cr-panel">
        <div className="cr-panel-header">
          <span className="cr-panel-icon">🔍</span>
          <div>
            <div className="cr-panel-title">Code Review</div>
            <div className="cr-panel-sub">
              {CR_CATEGORIES.reduce((s, c) => s + c.problems.length, 0)} problems · Go
            </div>
          </div>
        </div>

        {CR_CATEGORIES.map((cat) => {
          const isOpen = cat.id === categoryId;
          return (
            <div key={cat.id} className="cr-cat">
              <NavLink
                to={`/code-review/${cat.id}/${cat.problems[0].id}`}
                className={`cr-cat-header ${isOpen ? "cr-cat-header--open" : ""}`}
              >
                <span className="cr-cat-icon">{cat.icon}</span>
                <span className="cr-cat-title">{cat.title}</span>
                <span className="cr-cat-chevron">{isOpen ? "▾" : "▸"}</span>
              </NavLink>

              {isOpen && (
                <div className="cr-problem-list">
                  {cat.problems.map((p, idx) => (
                    <NavLink
                      key={p.id}
                      to={`/code-review/${cat.id}/${p.id}`}
                      className={({ isActive }) =>
                        `cr-problem-item ${isActive ? "cr-problem-item--active" : ""}`
                      }
                    >
                      <span className="cr-problem-num">{String(idx + 1).padStart(2, "0")}</span>
                      <span className="cr-problem-name">{p.title}</span>
                      <span className={`cr-diff ${DIFF_CLASS[p.difficulty]}`}>
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
      <main className="cr-detail">
        {/* Header */}
        <div className="cr-detail-header">
          <div className="cr-detail-meta">
            <span className="cr-badge">Code Review</span>
            <span className="cr-category-badge">{problem.category}</span>
            <span className={`cr-diff cr-diff--lg ${DIFF_CLASS[problem.difficulty]}`}>
              {problem.difficulty}
            </span>
          </div>
          <h1 className="cr-detail-title">{problem.title}</h1>
          <p className="cr-detail-desc">{problem.description}</p>
        </div>

        {/* Step 1 — Buggy Code */}
        <section className="cr-section">
          <div className="cr-section-label cr-label-bug">
            <span className="cr-label-icon">❌</span>
            <h2 className="cr-section-title">Step 1 — Buggy Code</h2>
            <span className="cr-label-hint">Read this first. Spot the issues before looking below.</span>
          </div>
          <CodeBlock code={problem.buggyCode} label="Go" />
        </section>

        {/* Step 2 — Issues Found */}
        <section className="cr-section">
          <div className="cr-section-label cr-label-issues">
            <span className="cr-label-icon">🔎</span>
            <h2 className="cr-section-title">Step 2 — Issues Found</h2>
          </div>
          <div className="cr-issues-list">
            {problem.issues.map((issue, i) => (
              <div key={i} className="cr-issue-card">
                <div className="cr-issue-top">
                  <span className={`cr-sev ${SEV_CLASS[issue.severity]}`}>{issue.severity}</span>
                  <span className="cr-issue-title">{issue.title}</span>
                </div>
                <p className="cr-issue-desc">{issue.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Step 3 — Annotated Review */}
        <section className="cr-section">
          <div className="cr-section-label cr-label-annotated">
            <span className="cr-label-icon">📝</span>
            <h2 className="cr-section-title">Step 3 — Annotated Review</h2>
            <span className="cr-label-hint">Same code with ❌ ISSUE and ✅ FIX comments inline.</span>
          </div>
          <CodeBlock code={problem.annotatedCode} label="Go" />
        </section>

        {/* Step 4 — Fixed Code */}
        <section className="cr-section">
          <div className="cr-section-label cr-label-fixed">
            <span className="cr-label-icon">✅</span>
            <h2 className="cr-section-title">Step 4 — Fixed Code</h2>
          </div>
          <CodeBlock code={problem.fixedCode} label="Go" />
        </section>

        {/* Key Takeaways */}
        <section className="cr-section cr-section--last">
          <div className="cr-section-label">
            <span className="cr-label-icon">💡</span>
            <h2 className="cr-section-title">Key Takeaways</h2>
          </div>
          <ul className="cr-takeaways">
            {problem.keyTakeaways.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
