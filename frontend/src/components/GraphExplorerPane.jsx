import React, { useRef, useEffect, useState, useMemo } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Maximize2, RefreshCw, Network, Tag, Filter, GitMerge, Compass } from 'lucide-react';
import NodeInspectorDrawer from './NodeInspectorDrawer';

const NODE_COLORS = {
  Department: '#f59e0b',
  Scheme: '#38bdf8',
  BeneficiaryGroup: '#34d399',
  Benefit: '#a78bfa',
  Document: '#fb7185',
  EligibilityCriteria: '#2dd4bf',
};

const ELIGIBILITY_CHIPS = [
  { id: 'small_farmer', label: 'Small Farmers', keyword: 'small' },
  { id: 'women', label: 'Women', keyword: 'women' },
  { id: 'full_subsidy', label: '100% Subsidy', keyword: '100%' },
  { id: 'chitta', label: 'Chitta / Adangal', keyword: 'chitta' },
  { id: 'solar', label: 'Solar / Irrigation', keyword: 'solar' },
];

export default function GraphExplorerPane({
  graphData,
  isSubgraphFiltered,
  onResetFullGraph,
  loadingGraph,
}) {
  const fgRef = useRef(null);
  const containerRef = useRef(null);
  const [dimensions, setDimensions] = useState({ width: 700, height: 700 });
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoverNode, setHoverNode] = useState(null);
  const [showAllLabels, setShowAllLabels] = useState(false);
  const [layoutMode, setLayoutMode] = useState(null); // null = Network, 'td' = Tree, 'radialout' = Radial
  const [activeChip, setActiveChip] = useState(null);

  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    if (!fgRef.current) return;
    fgRef.current.d3Force('charge')?.strength(-280).distanceMax(450);
    fgRef.current.d3Force('link')?.distance((link) => {
      const targetLabel = typeof link.target === 'object' ? link.target.label : '';
      return targetLabel === 'Scheme' ? 120 : 85;
    });
    fgRef.current.d3ReheatSimulation();
  }, [graphData, layoutMode]);

  useEffect(() => {
    if (fgRef.current && graphData?.nodes?.length > 0) {
      const timer = setTimeout(() => {
        fgRef.current?.zoomToFit(600, 70);
      }, 650);
      return () => clearTimeout(timer);
    }
  }, [graphData, layoutMode]);

  // Compute node IDs matching the active Citizen Eligibility Filter Chip
  const chipMatchedNodeIds = useMemo(() => {
    if (!activeChip) return null;
    const chip = ELIGIBILITY_CHIPS.find((c) => c.id === activeChip);
    if (!chip) return null;

    const directHits = new Set();
    graphData.nodes.forEach((n) => {
      const blob = `${n.name} ${JSON.stringify(n.properties || {})}`.toLowerCase();
      if (blob.includes(chip.keyword)) {
        directHits.add(n.id);
      }
    });

    // Expand 1 hop so connected Schemes & sibling entities glow together
    const expandedHits = new Set(directHits);
    graphData.links.forEach((l) => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      if (directHits.has(srcId)) expandedHits.add(tgtId);
      if (directHits.has(tgtId)) expandedHits.add(srcId);
    });

    return expandedHits;
  }, [activeChip, graphData]);

  const isNeighborOfHover = (node) => {
    if (!hoverNode) return false;
    if (hoverNode.id === node.id) return true;
    return graphData.links.some((l) => {
      const srcId = typeof l.source === 'object' ? l.source.id : l.source;
      const tgtId = typeof l.target === 'object' ? l.target.id : l.target;
      return (
        (srcId === hoverNode.id && tgtId === node.id) ||
        (tgtId === hoverNode.id && srcId === node.id)
      );
    });
  };

  return (
    <div ref={containerRef} className="relative flex h-full w-full flex-col bg-slate-950 overflow-hidden">
      {/* Primary Top Toolbar */}
      <div className="z-20 flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-900/95 px-4 py-2 backdrop-blur">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-sky-400" />
          <span className="text-xs font-semibold tracking-wide text-slate-200 uppercase">
            Neo4j Live Subgraph
          </span>
          <span className="rounded-full bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-300">
            {graphData.nodes.length} nodes · {graphData.links.length} edges
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* 3-Mode Layout Switcher */}
          <div className="flex items-center rounded-lg border border-slate-700 bg-slate-800 p-0.5 text-[11px]">
            <button
              onClick={() => setLayoutMode(null)}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                layoutMode === null ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
              title="Force-Directed Network"
            >
              <Network className="h-3 w-3" />
              Network
            </button>
            <button
              onClick={() => setLayoutMode('td')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                layoutMode === 'td' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
              title="Top-Down Hierarchy"
            >
              <GitMerge className="h-3 w-3" />
              Tree
            </button>
            <button
              onClick={() => setLayoutMode('radialout')}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium transition ${
                layoutMode === 'radialout' ? 'bg-sky-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
              title="Radial Starburst"
            >
              <Compass className="h-3 w-3" />
              Radial
            </button>
          </div>

          <button
            onClick={() => setShowAllLabels((prev) => !prev)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
              showAllLabels
                ? 'border-sky-500/50 bg-sky-500/20 text-sky-300'
                : 'border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            <Tag className="h-3.5 w-3.5" />
            {showAllLabels ? 'All Labels' : 'Smart'}
          </button>

          {isSubgraphFiltered && (
            <button
              onClick={() => {
                setSelectedNode(null);
                setActiveChip(null);
                onResetFullGraph();
              }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset
            </button>
          )}

          <button
            onClick={() => fgRef.current?.zoomToFit(500, 70)}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
            title="Fit graph to view"
          >
            <Maximize2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Citizen Eligibility Quick-Filter Strip */}
      <div className="z-20 flex flex-wrap items-center gap-1.5 border-b border-slate-800/80 bg-slate-900/75 px-4 py-2 backdrop-blur">
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400 mr-1">
          <Filter className="h-3 w-3 text-amber-400" />
          Highlight Eligibility:
        </span>
        {ELIGIBILITY_CHIPS.map((chip) => {
          const isActive = activeChip === chip.id;
          return (
            <button
              key={chip.id}
              onClick={() => setActiveChip(isActive ? null : chip.id)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition border ${
                isActive
                  ? 'border-amber-400 bg-amber-400/20 text-amber-300 shadow-sm'
                  : 'border-slate-700/80 bg-slate-800/70 text-slate-300 hover:border-slate-600 hover:text-white'
              }`}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* Node Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-wrap gap-2.5 rounded-xl border border-slate-800 bg-slate-900/90 px-3 py-2 backdrop-blur">
        {Object.entries(NODE_COLORS).map(([label, color]) => (
          <div key={label} className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </div>
        ))}
      </div>

      {/* Node Details Slide-Over */}
      <NodeInspectorDrawer
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        colorMap={NODE_COLORS}
      />

      {/* Interactive 2D Force Graph Canvas */}
      {loadingGraph ? (
        <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
          Loading Neo4j Knowledge Graph...
        </div>
      ) : (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height - 84}
          graphData={graphData}
          dagMode={layoutMode}
          dagLevelDistance={75}
          backgroundColor="#020617"
          cooldownTicks={120}
          d3AlphaDecay={0.025}
          d3VelocityDecay={0.3}
          nodeRelSize={6}
          linkColor={(link) => {
            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
            if (chipMatchedNodeIds) {
              return chipMatchedNodeIds.has(srcId) && chipMatchedNodeIds.has(tgtId)
                ? 'rgba(250, 204, 21, 0.75)'
                : 'rgba(148, 163, 184, 0.06)';
            }
            if (!hoverNode) return 'rgba(148, 163, 184, 0.28)';
            return srcId === hoverNode.id || tgtId === hoverNode.id
              ? 'rgba(56, 189, 248, 0.85)'
              : 'rgba(148, 163, 184, 0.08)';
          }}
          linkWidth={(link) => {
            if (!hoverNode) return 1;
            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
            return srcId === hoverNode.id || tgtId === hoverNode.id ? 2 : 0.6;
          }}
          linkDirectionalArrowLength={4}
          linkDirectionalArrowRelPos={1}
          linkDirectionalParticles={(link) => {
            if (!hoverNode) return 1;
            const srcId = typeof link.source === 'object' ? link.source.id : link.source;
            const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
            return srcId === hoverNode.id || tgtId === hoverNode.id ? 3 : 0;
          }}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={1.8}
          linkCanvasObjectMode={() => 'after'}
          linkCanvasObject={(link, ctx, globalScale) => {
            const start = link.source;
            const end = link.target;
            if (typeof start !== 'object' || typeof end !== 'object') return;

            const isHoveredLink =
              hoverNode && (start.id === hoverNode.id || end.id === hoverNode.id);

            if (!isHoveredLink && globalScale < 2.1) return;

            const midX = (start.x + end.x) / 2;
            const midY = (start.y + end.y) / 2;
            const fontSize = Math.max(8 / globalScale, 3.2);

            ctx.font = `${fontSize}px Sans-Serif`;
            const textWidth = ctx.measureText(link.type).width;
            ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
            ctx.fillRect(
              midX - textWidth / 2 - 2,
              midY - fontSize / 2 - 1,
              textWidth + 4,
              fontSize + 2
            );

            ctx.fillStyle = isHoveredLink ? '#7dd3fc' : '#94a3b8';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(link.type, midX, midY);
          }}
          nodeCanvasObject={(node, ctx, globalScale) => {
            const isPrimaryHub = node.label === 'Scheme' || node.label === 'Department';
            const radius = node.label === 'Department' ? 8.5 : node.label === 'Scheme' ? 7 : 5;
            const baseColor = NODE_COLORS[node.label] || '#94a3b8';

            const isChipHit = chipMatchedNodeIds ? chipMatchedNodeIds.has(node.id) : false;
            const highlighted =
              isNeighborOfHover(node) || selectedNode?.id === node.id || isChipHit;
            const dimmed =
              (hoverNode && !highlighted) || (chipMatchedNodeIds && !isChipHit);

            ctx.beginPath();
            ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
            ctx.fillStyle = dimmed ? `${baseColor}28` : baseColor;
            ctx.fill();

            if (isChipHit || selectedNode?.id === node.id || hoverNode?.id === node.id) {
              ctx.lineWidth = 2.5 / globalScale;
              ctx.strokeStyle = isChipHit ? '#facc15' : '#ffffff';
              ctx.stroke();
            }

            const shouldShowLabel =
              showAllLabels ||
              highlighted ||
              (isPrimaryHub && globalScale >= 0.75) ||
              globalScale >= 1.35;

            if (!shouldShowLabel) return;

            const rawLabel = node.name || node.label;
            const maxChars = isPrimaryHub ? 24 : 18;
            const shortLabel =
              rawLabel.length > maxChars ? `${rawLabel.slice(0, maxChars)}…` : rawLabel;

            const fontSize = Math.min(11 / globalScale, 11);
            ctx.font = `${isPrimaryHub ? '600 ' : ''}${fontSize}px Sans-Serif`;

            const textWidth = ctx.measureText(shortLabel).width;
            const padX = 4 / globalScale;
            const padY = 2 / globalScale;
            const labelY = node.y + radius + 3 / globalScale;

            ctx.fillStyle = dimmed ? 'rgba(15, 23, 42, 0.4)' : 'rgba(15, 23, 42, 0.9)';
            ctx.beginPath();
            ctx.roundRect(
              node.x - textWidth / 2 - padX,
              labelY - padY,
              textWidth + padX * 2,
              fontSize + padY * 2,
              3 / globalScale
            );
            ctx.fill();

            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillStyle = dimmed
              ? 'rgba(226, 232, 240, 0.3)'
              : isChipHit
              ? '#fef08a'
              : '#f1f5f9';
            ctx.fillText(shortLabel, node.x, labelY);
          }}
          onNodeHover={(node) => {
            setHoverNode(node || null);
            if (containerRef.current) {
              containerRef.current.style.cursor = node ? 'pointer' : 'default';
            }
          }}
          onNodeClick={(node) => {
            setSelectedNode(node);
            fgRef.current?.centerAt(node.x, node.y, 400);
          }}
        />
      )}
    </div>
  );
}