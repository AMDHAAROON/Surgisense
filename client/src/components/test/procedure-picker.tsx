import { useMemo } from "react";
import { Procedure } from "@shared/schema";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export function ProcedurePicker({
  procedures,
  value,
  onChange,
  disabled,
}: {
  procedures: Procedure[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled?: boolean;
}) {
  const items = useMemo(
    () =>
      procedures
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, name: p.name, description: p.description })),
    [procedures],
  );

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold">Procedure</p>
      <Select
        value={value ? String(value) : undefined}
        onValueChange={(v) => onChange(v ? Number(v) : null)}
        disabled={disabled}
      >
        <SelectTrigger className={cn("bg-background/25")}>
          <SelectValue placeholder="Select a procedure…" />
        </SelectTrigger>
        <SelectContent>
          {items.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              <div className="flex flex-col">
                <span className="font-semibold">{p.name}</span>
                <span className="text-xs text-muted-foreground line-clamp-1">{p.description}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Choose a procedure to load its stages and required tools.
      </p>
    </div>
  );
}
