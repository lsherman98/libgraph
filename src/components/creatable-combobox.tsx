import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Option {
  label: string;
  value: string;
}

interface CreatableComboboxProps {
  options: Option[];
  value?: string | string[];
  onSelect: (value: string) => void;
  onCreate?: (value: string) => void;
  placeholder?: string;
  emptyText?: string;
  isMulti?: boolean;
  allowClear?: boolean;
  searchable?: boolean;
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
  allowClear = false,
  searchable = true,
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
    if (inputValue && onCreate) {
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
          className={cn("w-full justify-between overflow-hidden min-w-0 shrink", className)}
        >
          <span className="truncate min-w-0">
            {(isMulti && Array.isArray(value) && value.length > 0) || (!isMulti && value) ? getSelectedLabels() : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-75 overflow-hidden p-0" align="start">
        <Command className="max-w-full">
          {searchable && <CommandInput placeholder={placeholder} value={inputValue} onValueChange={setInputValue} />}
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup heading="Suggestions">
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  className="[&>span]:whitespace-normal"
                  onSelect={() => {
                    if (!isMulti && allowClear && value === option.value) {
                      onSelect("");
                    } else {
                      onSelect(option.value);
                    }
                    if (!isMulti) setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4 shrink-0",
                      (isMulti && Array.isArray(value) && value.includes(option.value)) || (!isMulti && value === option.value)
                        ? "opacity-100"
                        : "opacity-0",
                    )}
                  />
                  <span className="min-w-0 wrap-break-word whitespace-normal">{option.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            {onCreate && inputValue && !options.some((opt) => opt.label.toLowerCase() === inputValue.toLowerCase()) && (
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
