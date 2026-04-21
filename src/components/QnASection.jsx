import { useState } from "react";
import ContentText from "./ContentText";
import "./QnASection.css";

const DIFFICULTY_CLASS = {
  Easy: "diff-easy",
  Medium: "diff-medium",
  Hard: "diff-hard",
};

const CATEGORIES = ["All", "Architecture", "CDN & Streaming", "Database Design",
  "Fault Tolerance", "Scale & Performance", "Recommendations",
  "API Design", "Chaos Engineering", "Security & DRM", "Observability"];

export default function QnASection({ questions }) {
  const [openId, setOpenId] = useState(null);
  const [activeCategory, setActiveCategory] = useState("All");

  const filtered = activeCategory === "All"
    ? questions
    : questions.filter((q) => q.category === activeCategory);

  const toggle = (id) => setOpenId((prev) => (prev === id ? null : id));

  return (
    <div className="qna-section">
      {/* Category filter */}
      <div className="qna-filters">
        {CATEGORIES.map((cat) => {
          const count = cat === "All"
            ? questions.length
            : questions.filter((q) => q.category === cat).length;
          if (count === 0) return null;
          return (
            <button
              key={cat}
              className={`qna-filter-btn ${activeCategory === cat ? "active" : ""}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
              <span className="qna-filter-count">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Questions list */}
      <div className="qna-list">
        {filtered.map((q, idx) => {
          const isOpen = openId === q.id;
          return (
            <div key={q.id} className={`qna-card ${isOpen ? "qna-card--open" : ""}`}>
              {/* Header — always visible */}
              <button
                className="qna-header"
                onClick={() => toggle(q.id)}
                aria-expanded={isOpen}
              >
                <div className="qna-header-left">
                  <span className="qna-num">Q{idx + 1}</span>
                  <div className="qna-meta">
                    <div className="qna-meta-row">
                      <span className={`qna-diff ${DIFFICULTY_CLASS[q.difficulty]}`}>
                        {q.difficulty}
                      </span>
                      <span className="badge badge-neutral">{q.category}</span>
                      <span className="qna-round">{q.round}</span>
                    </div>
                    <p className="qna-question">{q.question}</p>
                  </div>
                </div>
                <div className="qna-header-right">
                  <div className="qna-asked-at">
                    {q.asked_at.map((c) => (
                      <span key={c} className="qna-company">{c}</span>
                    ))}
                  </div>
                  <span className="qna-chevron" aria-hidden>{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Answer — collapsible */}
              {isOpen && (
                <div className="qna-body">
                  <div className="qna-answer-label">
                    <span className="dot dot--green" />
                    Model Answer
                  </div>
                  <div className="qna-answer-content">
                    <ContentText text={q.answer} />
                  </div>

                  {q.followups?.length > 0 && (
                    <div className="qna-followups">
                      <p className="qna-followups-label">
                        <span className="dot dot--yellow" />
                        Likely follow-up questions
                      </p>
                      <ul className="qna-followups-list">
                        {q.followups.map((f, i) => (
                          <li key={i} className="qna-followup-item">{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
