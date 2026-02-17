import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Minus, Plus, Check, Type } from "lucide-react";
import { cn } from "@/lib/utils";

export function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div>{children}</div>
    </div>
  );
}

export function SliderWithValue({
  value,
  min,
  max,
  step,
  onChange,
  unit = "",
  showButtons = true,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  unit?: string;
  showButtons?: boolean;
}) {
  const increment = () => onChange(Number(Math.min(max, value + step).toFixed(2)));
  const decrement = () => onChange(Number(Math.max(min, value - step).toFixed(2)));

  return (
    <div className="flex items-center gap-3">
      {showButtons && (
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={decrement} disabled={value <= min}>
          <Minus className="h-3 w-3" />
        </Button>
      )}
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={([v]) => onChange(v)} className="flex-1" />
      {showButtons && (
        <Button variant="outline" size="icon" className="h-8 w-8 shrink-0" onClick={increment} disabled={value >= max}>
          <Plus className="h-3 w-3" />
        </Button>
      )}
      <span className="text-sm text-muted-foreground w-14 text-right tabular-nums">
        {value}
        {unit}
      </span>
    </div>
  );
}

export function ThemeButton({
  theme,
  isActive,
  onClick,
}: {
  theme: { name: string; backgroundColor: string; textColor: string };
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative flex flex-col items-center gap-1 rounded-md p-1.5 transition-all",
        "hover:bg-accent/50",
        isActive && "ring-2 ring-primary ring-offset-1 ring-offset-background",
      )}
    >
      <div className="h-8 w-8 rounded-md border shadow-sm flex items-center justify-center" style={{ backgroundColor: theme.backgroundColor }}>
        <Type className="h-3 w-3" style={{ color: theme.textColor }} />
      </div>
      <span className="text-[10px] font-medium">{theme.name}</span>
    </button>
  );
}

export function FontFamilyButton({ family, isActive, onClick }: { family: { name: string; value: string }; isActive: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 w-full px-2 py-1.5 rounded-md transition-all text-left",
        "hover:bg-accent/50",
        isActive && "bg-accent ring-1 ring-primary/20",
      )}
    >
      <div className="text-sm leading-none w-6" style={{ fontFamily: family.value }}>
        Aa
      </div>
      <span className="text-xs font-medium flex-1">{family.name}</span>
      {isActive && <Check className="h-3 w-3 text-primary" />}
    </button>
  );
}

export function QuickFontSizeControl({ fontSize, onChange }: { fontSize: number; onChange: (size: number) => void }) {
  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(Math.max(12, fontSize - 1))} disabled={fontSize <= 12}>
        <Minus className="h-3 w-3" />
      </Button>
      <span className="text-sm w-8 text-center tabular-nums">{fontSize}</span>
      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onChange(Math.min(32, fontSize + 1))} disabled={fontSize >= 32}>
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}
