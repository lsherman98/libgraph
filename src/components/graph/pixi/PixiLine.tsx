import { extend, useApplication } from "@pixi/react";
import { Graphics as PIXIGraphics } from "pixi.js";
import React from "react";

// Extend pixi.js with Graphics
extend({ Graphics: PIXIGraphics });

interface PixiLineProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

export const PixiLine = (props: PixiLineProps) => {
  const { app } = useApplication();
  const graphicsRef = React.useRef<PIXIGraphics | null>(null);

  // Create and add graphics to stage
  React.useEffect(() => {
    if (!app) return;
    const g = new PIXIGraphics();
    graphicsRef.current = g;
    app.stage.addChild(g);

    return () => {
      app.stage.removeChild(g);
      g.destroy();
    };
  }, [app]);

  // Update line whenever positions change
  React.useEffect(() => {
    const g = graphicsRef.current;
    if (!g) return;

    g.clear();
    g.moveTo(props.x1, props.y1);
    g.lineTo(props.x2, props.y2);
    g.stroke({ width: 1, color: props.color, alpha: 0.6 });
  }, [props.x1, props.y1, props.x2, props.y2, props.color]);

  return null;
};
