import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FONT_FAMILIES, READER_THEMES } from "@/lib/hooks/use-reader-settings";
import type { FontFamilyKey, ReaderSettings, ReaderThemeKey } from "@/lib/hooks/use-reader-settings";
import { AlignCenter, AlignJustify, AlignLeft, Palette, RotateCcw, Settings2, Type } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SettingRow, SliderWithValue, ThemeButton, FontFamilyButton } from "./reader-settings-controls";

interface ReaderSettingsPanelProps {
  settings: ReaderSettings;
  onSettingsChange: (settings: Partial<ReaderSettings>) => void;
  onApplyTheme: (theme: ReaderThemeKey) => void;
  onReset: () => void;
}

export function ReaderSettingsPanel({ settings, onSettingsChange, onApplyTheme, onReset }: ReaderSettingsPanelProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="icon" className="h-9 w-9">
          <Settings2 className="h-4 w-4" />
          <span className="sr-only">Reader Settings</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end" sideOffset={8}>
        <div className="p-4 border-b">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Reader Settings
          </h4>
          <p className="text-xs text-muted-foreground mt-1">Customize your reading experience</p>
        </div>
        <Tabs defaultValue="typography" className="w-full">
          <TabsList className="grid w-full grid-cols-2 rounded-none border-b bg-transparent p-0 h-10">
            <TabsTrigger
              value="typography"
              className="relative gap-1.5 text-xs rounded-none border-0 bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:after:bg-primary"
            >
              <Type className="h-3.5 w-3.5" />
              Text
            </TabsTrigger>
            <TabsTrigger
              value="theme"
              className="relative gap-1.5 text-xs rounded-none border-0 bg-transparent shadow-none data-[state=active]:bg-transparent data-[state=active]:shadow-none after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 data-[state=active]:after:bg-primary"
            >
              <Palette className="h-3.5 w-3.5" />
              Theme
            </TabsTrigger>
          </TabsList>
          <ScrollArea className="h-80">
            <TabsContent value="typography" className="mt-0 p-4 space-y-4">
              <SettingRow label="Font Family">
                <div className="space-y-1">
                  {Object.entries(FONT_FAMILIES).map(([key, family]) => (
                    <FontFamilyButton
                      key={key}
                      family={family}
                      isActive={settings.fontFamily === key}
                      onClick={() => onSettingsChange({ fontFamily: key as FontFamilyKey })}
                    />
                  ))}
                </div>
              </SettingRow>
              <Separator />
              <SettingRow label="Font Size">
                <SliderWithValue
                  value={settings.fontSize}
                  min={12}
                  max={32}
                  step={1}
                  onChange={(fontSize) => onSettingsChange({ fontSize })}
                  unit="px"
                  showButtons={false}
                />
              </SettingRow>
              <SettingRow label="Line Height">
                <SliderWithValue
                  value={settings.lineHeight}
                  min={1.2}
                  max={2.5}
                  step={0.1}
                  onChange={(lineHeight) => onSettingsChange({ lineHeight })}
                  showButtons={false}
                />
              </SettingRow>
              <SettingRow label="Letter Spacing">
                <SliderWithValue
                  value={settings.letterSpacing}
                  min={-0.05}
                  max={0.15}
                  step={0.01}
                  onChange={(letterSpacing) => onSettingsChange({ letterSpacing })}
                  unit="em"
                  showButtons={false}
                />
              </SettingRow>
              <SettingRow label="Paragraph Spacing">
                <SliderWithValue
                  value={settings.paragraphSpacing}
                  min={0.5}
                  max={3}
                  step={0.1}
                  onChange={(paragraphSpacing) => onSettingsChange({ paragraphSpacing })}
                  unit="em"
                  showButtons={false}
                />
              </SettingRow>
              <Separator />
              <SettingRow label="Text Alignment">
                <ToggleGroup
                  type="single"
                  value={settings.textAlign}
                  onValueChange={(value) =>
                    value &&
                    onSettingsChange({
                      textAlign: value as "left" | "justify" | "center",
                    })
                  }
                  className="justify-start"
                  size="sm"
                >
                  <ToggleGroupItem value="left" aria-label="Align Left">
                    <AlignLeft className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="center" aria-label="Align Center">
                    <AlignCenter className="h-4 w-4" />
                  </ToggleGroupItem>
                  <ToggleGroupItem value="justify" aria-label="Justify">
                    <AlignJustify className="h-4 w-4" />
                  </ToggleGroupItem>
                </ToggleGroup>
              </SettingRow>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label className="text-xs font-medium">Hyphenation</Label>
                  <p className="text-xs text-muted-foreground">Auto word hyphenation</p>
                </div>
                <Switch checked={settings.hyphenation} onCheckedChange={(hyphenation) => onSettingsChange({ hyphenation })} />
              </div>
            </TabsContent>
            <TabsContent value="theme" className="mt-0 p-4 space-y-4">
              <SettingRow label="Theme Presets">
                <div className="grid grid-cols-4 gap-1.5">
                  {Object.entries(READER_THEMES).map(([key, theme]) => (
                    <ThemeButton key={key} theme={theme} isActive={settings.theme === key} onClick={() => onApplyTheme(key as ReaderThemeKey)} />
                  ))}
                </div>
              </SettingRow>
              <Separator />
              <SettingRow label="Custom Colors">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-xs">Background</Label>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="h-7 w-7 rounded border cursor-pointer shrink-0" style={{ backgroundColor: settings.backgroundColor }}>
                        <Input
                          type="color"
                          value={settings.backgroundColor}
                          onChange={(e) =>
                            onSettingsChange({
                              backgroundColor: e.target.value,
                              theme: "custom",
                            })
                          }
                          className="h-full w-full opacity-0 cursor-pointer"
                        />
                      </div>
                      <Input
                        type="text"
                        value={settings.backgroundColor}
                        onChange={(e) =>
                          onSettingsChange({
                            backgroundColor: e.target.value,
                            theme: "custom",
                          })
                        }
                        className="flex-1 h-7 font-mono text-xs"
                        placeholder="#ffffff"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label className="w-20 text-xs">Text</Label>
                    <div className="flex items-center gap-2 flex-1">
                      <div className="h-7 w-7 rounded border cursor-pointer shrink-0" style={{ backgroundColor: settings.textColor }}>
                        <Input
                          type="color"
                          value={settings.textColor}
                          onChange={(e) =>
                            onSettingsChange({
                              textColor: e.target.value,
                              theme: "custom",
                            })
                          }
                          className="h-full w-full opacity-0 cursor-pointer"
                        />
                      </div>
                      <Input
                        type="text"
                        value={settings.textColor}
                        onChange={(e) =>
                          onSettingsChange({
                            textColor: e.target.value,
                            theme: "custom",
                          })
                        }
                        className="flex-1 h-7 font-mono text-xs"
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                </div>
              </SettingRow>
            </TabsContent>
          </ScrollArea>
        </Tabs>
        <div className="p-3 border-t">
          <Button variant="outline" size="sm" className="w-full" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
