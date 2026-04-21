import "./ContentText.css";

export default function ContentText({ text }) {
  if (!text) return null;
  return (
    <div className="content-text">
      {text.split("\n").map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="content-spacer" />;
        if (trimmed.startsWith("•"))
          return <div key={i} className="content-bullet">{trimmed.slice(1).trim()}</div>;
        if (/^\d+\./.test(trimmed))
          return <div key={i} className="content-numbered">{trimmed}</div>;
        if (trimmed.startsWith("#"))
          return <p key={i} className="content-heading">{trimmed.replace(/^#+\s*/, "")}</p>;
        if (trimmed.includes("→"))
          return <div key={i} className="content-flow">{trimmed}</div>;
        if (trimmed.match(/^[A-Z_]{2,}.*:/))
          return <div key={i} className="content-keyword">{trimmed}</div>;
        return <p key={i} className="content-para">{trimmed}</p>;
      })}
    </div>
  );
}
