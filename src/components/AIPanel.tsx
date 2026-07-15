import type { AIOutput } from "../ai/types";

type Props = {
  ai?: AIOutput;
  loading: boolean;
  onRegenerate: () => void;
};

export function AIPanel({ ai, loading, onRegenerate }: Props) {
  if (loading) {
    return (
      <div className="ai-panel loading" aria-busy="true">
        <ul className="ai-list">
          <li><span className="ai-shimmer" /></li>
          <li><span className="ai-shimmer" /></li>
          <li><span className="ai-shimmer" /></li>
        </ul>
      </div>
    );
  }

  if (!ai) {
    return (
      <div className="ai-panel empty">
        <p className="ai-empty">No AI notes yet.</p>
        <button type="button" className="regen-btn" onClick={onRegenerate}>
          Generate
        </button>
      </div>
    );
  }

  return (
    <div className="ai-panel">
      <ul className="ai-list">
        <li>{ai.suggestion}</li>
        <li>{ai.followup}</li>
        <li>{ai.question}</li>
      </ul>
      <div className="ai-meta">
        <span>{new Date(ai.generatedAt).toLocaleString()}</span>
        <span className="ai-model">{ai.model}</span>
        <button type="button" className="regen-btn" onClick={onRegenerate}>
          Regenerate
        </button>
      </div>
    </div>
  );
}
