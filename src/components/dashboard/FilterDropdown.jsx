import React from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from '@/lib/utils';

export default function FilterDropdown({ 
  label, 
  value, 
  onChange, 
  options, 
  placeholder = "Todos",
  icon: Icon,
  className
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <label className="text-xs font-medium text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </label>
      )}
      <Select value={value || "all"} onValueChange={(v) => onChange(v === "all" ? null : v)}>
        <SelectTrigger className="w-full min-w-[180px] bg-white/80 backdrop-blur-sm border-slate-200 hover:border-slate-300 transition-colors">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-white/95 backdrop-blur-sm">
          <SelectItem value="all">{placeholder}</SelectItem>
          {options.map((option) => (
            <SelectItem key={option} value={option}>
              {option}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}