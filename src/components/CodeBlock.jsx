import { useState } from "react";
import "./CodeBlock.css";

export default function CodeBlock({ code, label }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-label">{label || "code"}</span>
        <button className="code-block-copy" onClick={handleCopy}>
          {copied ? "✓ copied" : "copy"}
        </button>
      </div>
      <pre className="code-block-pre"><code>{code}</code></pre>
    </div>
  );
}
