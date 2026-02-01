import { Graphics as PIXIGraphics } from "pixi.js";
import { extend, useApplication, useTick } from "@pixi/react";
import type { Body } from "matter-js";
import Matter from "matter-js";
import React from "react";
import { useEngine } from "./World";

// Extend pixi.js with Graphics
extend({ Graphics: PIXIGraphics });

export const extractCoordinates = (vertice: { x: number; y: number }): [number, number] => [vertice.x, vertice.y];

export interface PixiNodeType {
  key: string;
  position: { x: number; y: number };
}

interface PixiNodeProps {
  x: number;
  y: number;
  radius: number;
  id: string;
  color?: string;
  setNodes: React.Dispatch<React.SetStateAction<PixiNodeType[]>>;
}

export const PixiNode = (props: PixiNodeProps) => {
  const { app } = useApplication();
  const engine = useEngine();
  const body = React.useRef<Body>(null) as React.MutableRefObject<Body>;
  const graphicsRef = React.useRef<PIXIGraphics | null>(null);
  const lastPosition = React.useRef({ x: props.x, y: props.y });
  const color = props.color ?? "#a39af7";

  // Create and add graphics to stage
  React.useEffect(() => {
    if (!app) return;
    const g = new PIXIGraphics();
    g.eventMode = "static";
    g.cursor = "pointer";
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

    // Use initial props for body creation
    const currentBody = Matter.Bodies.circle(props.x, props.y, props.radius, {
      friction: 1,
      density: 0.1,
      restitution: 0,
      frictionAir: 0.09,
      frictionStatic: 1,
    });
    body.current = currentBody;

    Matter.World.add(engine.world, currentBody);

    return () => {
      Matter.World.remove(engine.world, currentBody);
    };
    // We intentionally ignore props.x/y updates to prevent body recreation during physics simulation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, props.radius]);

  useTick(() => {
    const g = graphicsRef.current;
    const b = body.current;

    if (!g || !b) return;

    // Redraw the node at the physics body position
    g.clear();
    g.circle(b.position.x, b.position.y, props.radius - 15);
    g.fill({ color });

    // Update state if position changed significantly (for edge rendering)
    if (
      Math.abs(lastPosition.current.x - b.position.x) > 0.1 ||
      Math.abs(lastPosition.current.y - b.position.y) > 0.1
    ) {
      lastPosition.current = { x: b.position.x, y: b.position.y };
      props.setNodes((prev: PixiNodeType[]) => {
        return prev.map((node) => {
          if (node.key === props.id) {
            return {
              ...node,
              position: {
                x: b.position.x,
                y: b.position.y,
              },
            };
          }
          return node;
        });
      });
    }
  });

  // Return null since we manage the graphics manually
  return null;
};
