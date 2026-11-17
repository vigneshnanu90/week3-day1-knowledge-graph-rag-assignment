import React from 'react';
import { X, Database, ExternalLink } from 'lucide-react';

export default function NodeInspectorDrawer({ node, onClose, colorMap }) {
  if (!node) return null;

  const badgeColor = colorMap[node.label] || '#64748b';
  const entries = Object.entries(node.properties || {}).filter(
    ([, val]) => val !== null && val !== undefined && val !== ''
  );

  return (
    <div className="absolute top-4 right-4 z-30 w-80 max-h-[82vh] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900/95 p-4 shadow-2xl backdrop-blur-md">
      <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-3">
        <div>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold text-slate-950"
            style={{ backgroundColor: badgeColor }}
          >
            <Database className="h-3 w-3" />
            {node.label}
          </span>
          <h3 className="mt-2 text-sm font-bold leading-snug text-white">
            {node.name}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          title="Close inspector"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 space-y-2.5 text-xs">
        {entries.length === 0 ? (
          <p className="text-slate-400">No additional properties stored on this node.</p>
        ) : (
          entries.map(([key, value]) => (
            <div key={key} className="rounded-lg bg-slate-800/70 p-2.5">
              <div className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
                {key}
              </div>
              {key === 'source_url' ? (
                <a
                  href={String(value)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-sky-400 hover:underline break-all"
                >
                  Open Portal Link <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <div className="mt-1 text-slate-100 leading-relaxed break-words">
                  {String(value)}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}