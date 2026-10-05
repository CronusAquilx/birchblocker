import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Gauge } from "lucide-react";
import { levelsQuery, modelsQuery } from "@/lib/astra/data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { AstraMark } from "./Mark";
import { cn } from "@/lib/utils";

type Props = { modelId: string; reasoning: string; onModel: (id: string) => void; onReasoning: (id: string) => void };

export function ModelPicker({ modelId, reasoning, onModel, onReasoning }: Props) {
  const { data: models } = useQuery(modelsQuery);
  const { data: levels } = useQuery(levelsQuery);
  const current = models?.find((m) => m.id === modelId);
  const level = levels?.find((l) => l.id === reasoning);

  return (
    <div className="flex items-center gap-1">
      <Popover>
        <PopoverTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <AstraMark className="size-3.5" />
          <span className="max-w-28 truncate">{current?.display_name ?? "Astra"}</span>
          <ChevronDown className="size-3.5" />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-1.5">
          <div className="px-2 py-1.5 label-mono">Model</div>
          {models?.map((m) => (
            <button
              key={m.id}
              onClick={() => onModel(m.id)}
              className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left hover:bg-accent"
            >
              <AstraMark className="mt-0.5 size-4 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{m.display_name}</div>
                <div className="text-xs text-muted-foreground">{m.description}</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="rounded-sm border px-1 label-mono">{Math.round(m.context_length / 1024)}k ctx</span>
                  <span className="rounded-sm border px-1 label-mono">{m.usage_multiplier}x</span>
                </div>
              </div>
              {m.id === modelId && <Check className="size-4 text-star" />}
            </button>
          ))}
          <p className="px-2 pt-2 pb-1 text-xs text-muted-foreground">More models can be added in a later phase.</p>
        </PopoverContent>
      </Popover>
      <Popover>
        <PopoverTrigger className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
          <Gauge className="size-3.5" />
          <span>{level?.label ?? "Medium"}</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1.5">
          <div className="px-2 py-1.5 label-mono">Reasoning</div>
          {levels?.map((l) => (
            <button
              key={l.id}
              onClick={() => onReasoning(l.id)}
              className={cn("flex w-full items-center rounded-md px-2 py-1.5 text-sm hover:bg-accent", l.id === reasoning && "text-star")}
            >
              <span className="flex-1 text-left">{l.label}</span>
              <span className="label-mono">{l.multiplier}x</span>
            </button>
          ))}
        </PopoverContent>
      </Popover>
    </div>
  );
}
