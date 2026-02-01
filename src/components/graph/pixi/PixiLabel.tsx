import { useApplication } from "@pixi/react";
import { Text, TextStyle } from "pixi.js";
import React from "react";

interface PixiLabelProps {
  text: string;
  x: number;
  y: number;
  color?: string;
}

export const PixiLabel = (props: PixiLabelProps) => {
  const { app } = useApplication();
  const textRef = React.useRef<Text | null>(null);

  const style = React.useMemo(
    () =>
      new TextStyle({
        fontFamily: "Arial",
        fontSize: 10,
        fill: props.color ?? "#ffffff",
        fontWeight: "400",
        align: "center",
      }),
    [props.color],
  );

  // Create and add text to stage
  React.useEffect(() => {
    if (!app) return;
    const t = new Text({ text: props.text, style });
    t.anchor.set(0.5);
    t.x = props.x;
    t.y = props.y;
    textRef.current = t;
    app.stage.addChild(t);

    return () => {
      app.stage.removeChild(t);
      t.destroy();
    };
  }, [app, props.text, style]);

  // Update position when it changes
  React.useEffect(() => {
    const t = textRef.current;
    if (!t) return;
    t.x = props.x;
    t.y = props.y;
  }, [props.x, props.y]);

  return null;
};
