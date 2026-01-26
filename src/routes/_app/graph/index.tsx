import { createFileRoute } from "@tanstack/react-router";
import { GraphCanvas } from "@/components/graph";

export const Route = createFileRoute("/_app/graph/")({
  component: GraphPage,
});

function GraphPage() {
  return (
    <div className="flex-1 flex flex-col h-full w-full">
      <GraphCanvas />
    </div>
  );
}
