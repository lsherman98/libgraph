import { Graphics as PIXIGraphics, Container as PIXIContainer } from "pixi.js";
import { extend, useApplication, useTick } from "@pixi/react";
import type { Body, IChamferableBodyDefinition } from "matter-js";
import Matter from "matter-js";
import React from "react";
import { extractCoordinates } from "./PixiNode";
import { useEngine } from "./World";

// Extend pixi.js with the components we need
extend({ Container: PIXIContainer, Graphics: PIXIGraphics });

interface BorderProps {
  scale: number;
}

const BorderInternal: React.FC<BorderProps> = ({ scale }) => {
  const s = scale;
  return (
    <>
      <Shape config={{ x: s / 2, y: s + 50, width: s, height: 100 }} options={{ isStatic: true }} />
      <Shape config={{ x: s / 2, y: -50, width: s, height: 100 }} options={{ isStatic: true }} />
      <Shape config={{ x: -50, y: s / 2, width: 100, height: s }} options={{ isStatic: true }} />
      <Shape config={{ x: s + 50, y: s / 2, width: 100, height: s }} options={{ isStatic: true }} />
    </>
  );
};

export const PixiBorder = React.memo(BorderInternal);

const Shape = ({
  config,
  options = {},
}: {
  config: { x: number; y: number; width: number; height: number };
  options?: IChamferableBodyDefinition;
}) => {
  const { app } = useApplication();
  const engine = useEngine();
  const body = React.useRef<Body>(null) as React.MutableRefObject<Body>;
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

  // Setup physics body
  React.useEffect(() => {
    if (!engine) return;

    body.current = Matter.Bodies.rectangle(config.x, config.y, config.width, config.height, options);

    Matter.World.add(engine.world, body.current);

    return () => {
      Matter.World.remove(engine.world, body.current);
    };
  }, [engine, config, options]);

  useTick(() => {
    const g = graphicsRef.current;
    const b = body.current;
    if (!g || !b) return;

    g.clear();
    const verts = b.vertices;
    if (verts.length === 0) return;

    g.moveTo(...extractCoordinates(verts[0]));
    for (let j = 1; j < verts.length; j += 1) {
      g.lineTo(...extractCoordinates(verts[j]));
    }
    g.lineTo(...extractCoordinates(verts[0]));
  });

  return null;
};
