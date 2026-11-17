import React, { useState, useEffect } from 'react';
import ChatPane from './components/ChatPane';
import GraphExplorerPane from './components/GraphExplorerPane';
import { fetchInitialGraph, sendChatQuery } from './api/client';

export default function App() {
  const [messages, setMessages] = useState([]);
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [isSubgraphFiltered, setIsSubgraphFiltered] = useState(false);
  const [loadingGraph, setLoadingGraph] = useState(true);
  const [isChatLoading, setIsChatLoading] = useState(false);

  const loadFullGraph = async () => {
    setLoadingGraph(true);
    try {
      const data = await fetchInitialGraph(90);
      setGraphData(data);
      setIsSubgraphFiltered(false);
    } catch (err) {
      console.error('Failed to fetch initial Neo4j graph:', err);
    } finally {
      setLoadingGraph(false);
    }
  };

  useEffect(() => {
    loadFullGraph();
  }, []);

  const handleSendMessage = async (question) => {
    setMessages((prev) => [...prev, { role: 'user', content: question }]);
    setIsChatLoading(true);

    try {
      const response = await sendChatQuery(question);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: response.answer,
          generated_cypher: response.generated_cypher,
          sources: response.sources,
          subgraph: response.subgraph,
        },
      ]);

      if (response.subgraph?.nodes?.length > 0) {
        setGraphData(response.subgraph);
        setIsSubgraphFiltered(true);
      }
    } catch (err) {
      const errMsg =
        err.response?.data?.detail ||
        'Unable to reach FastAPI GraphRAG backend. Ensure Uvicorn is running on port 8000.';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `**Error:** ${errMsg}` },
      ]);
    } finally {
      setIsChatLoading(false);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col md:flex-row overflow-hidden bg-slate-950">
      {/* Left Pane: GraphRAG Chat */}
      <div className="h-1/2 w-full md:h-full md:w-[44%] lg:w-[40%]">
        <ChatPane
          messages={messages}
          onSendMessage={handleSendMessage}
          isLoading={isChatLoading}
          onSelectSubgraph={(subgraph) => {
            setGraphData(subgraph);
            setIsSubgraphFiltered(true);
          }}
        />
      </div>

      {/* Right Pane: Interactive Neo4j Subgraph Canvas */}
      <div className="h-1/2 w-full md:h-full md:w-[56%] lg:w-[60%]">
        <GraphExplorerPane
          graphData={graphData}
          isSubgraphFiltered={isSubgraphFiltered}
          onResetFullGraph={loadFullGraph}
          loadingGraph={loadingGraph}
        />
      </div>
    </div>
  );
}