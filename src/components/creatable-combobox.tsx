import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Option {
  label: string;
  value: string;
}

interface CreatableComboboxProps {
  options: Option[];
  value?: string | string[];
  onSelect: (value: string) => void;
  onCreate: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  isMulti?: boolean;
  className?: string;
}

export function CreatableCombobox({
  options,
  value,
  onSelect,
  onCreate,
  placeholder = "Select...",
  emptyText = "No results found.",
  isMulti = false,
  className,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [inputValue, setInputValue] = React.useState("");

  const getSelectedLabels = () => {
    if (isMulti && Array.isArray(value)) {
      return value.map((v) => options.find((opt) => opt.value === v)?.label || v).join(", ");
    }
    return options.find((opt) => opt.value === value)?.label || value;
  };

  const handleCreate = () => {
    if (inputValue) {
      onCreate(inputValue);
      setInputValue("");
      if (!isMulti) setOpen(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <span className="truncate">
            {(isMulti && Array.isArray(value) && value.length > 0) || (!isMulti && value)
              ? getSelectedLabels()
              : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} value={inputValue} onValueChange={setInputValue} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup heading="Suggestions">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onSelect(option.value);
                    if (!isMulti) setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      (isMulti && Array.isArray(value) && value.includes(option.value)) ||
                        (!isMulti && value === option.value)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {inputValue && !options.some((opt) => opt.label.toLowerCase() === inputValue.toLowerCase()) && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem onSelect={handleCreate} value={inputValue} className="cursor-pointer">
                    <Plus className="mr-2 h-4 w-4" />
                    Create "{inputValue}"
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
