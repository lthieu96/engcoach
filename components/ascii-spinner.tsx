import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

export function AsciiSpinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span
      role="status"
      aria-label={label ?? "Loading"}
      className={cn("inline-flex items-center gap-2 text-sm", className)}
    >
      <Spinner aria-hidden className="size-3.5" />
      {label && <span>{label}</span>}
    </span>
  );
}
