import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Shared summary card: compact icon, clear value, and optional supporting detail. */
export type KpiTone =
  | "primary"
  | "accent"
  | "success"
  | "warning"
  | "info"
  | "neutral"
  | "brandGreen";

const BASE_TONE = {
  card: "border-[#e5ecf4] bg-white",
  value: "text-[var(--brand-ink)]",
  muted: "text-slate-500",
};

const TONE_STYLES: Record<
  KpiTone,
  {
    card: string;
    bg: string;
    text: string;
    value: string;
    muted: string;
    strip: string;
  }
> = {
  primary: {
    ...BASE_TONE,
    bg: "bg-blue-50",
    text: "text-[var(--brand-primary)]",
    strip: "",
  },
  accent: { ...BASE_TONE, bg: "bg-orange-50", text: "text-[#c74300]", strip: "" },
  success: {
    ...BASE_TONE,
    bg: "bg-emerald-50",
    text: "text-emerald-600",
    strip: "",
  },
  warning: {
    ...BASE_TONE,
    bg: "bg-rose-50",
    text: "text-[var(--brand-danger)]",
    strip: "",
  },
  info: { ...BASE_TONE, bg: "bg-sky-50", text: "text-sky-600", strip: "" },
  neutral: {
    ...BASE_TONE,
    bg: "bg-slate-100",
    text: "text-slate-600",
    strip: "",
  },
  brandGreen: {
    card: "border-orange-200 bg-orange-50/40",
    bg: "bg-orange-100",
    text: "text-primary",
    value: "text-primary",
    muted: "text-primary",
    strip: "",
  },
};

export interface KpiCardProps {
  /** Icon node — typically a lucide-react component sized h-5 w-5. */
  icon?: React.ReactNode;
  /** Short descriptor rendered above the value. */
  label: string;
  /** The primary metric. String or pre-formatted React node. */
  value: React.ReactNode;
  /** Optional second-line value/description below the main value. */
  hint?: React.ReactNode;
  /** Optional trend / delta indicator. Use direction='up' for positive. */
  trend?: {
    direction: "up" | "down" | "flat";
    text: string;
  };
  /** Icon chip color preset. Defaults to primary (navy). */
  tone?: KpiTone;
  /** Optional onClick — when set the tile becomes interactive. */
  onClick?: () => void;
  className?: string;
}

export function KpiCard({
  icon,
  label,
  value,
  hint,
  trend,
  tone = "primary",
  onClick,
  className,
}: KpiCardProps) {
  const toneCls = TONE_STYLES[tone];
  const isInteractive = !!onClick;

  return (
    <Card
      onClick={onClick}
      role={isInteractive ? "button" : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onKeyDown={isInteractive ? (event) => {
        if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault(); onClick?.();
        }
      } : undefined}
      className={cn(
        "relative min-w-0 gap-0 overflow-hidden rounded-2xl py-0 shadow-sm ring-0 transition-colors",
        toneCls.card,
        isInteractive && "cursor-pointer hover:border-orange-300 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
        className,
      )}
    >
      <CardContent className="flex h-full min-h-[140px] flex-col p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className={cn("min-w-0 pt-1 text-xs font-medium leading-5 sm:text-sm", toneCls.muted)}>{label}</p>
          {icon && <div aria-hidden="true" className={cn("flex size-8 shrink-0 items-center justify-center rounded-xl sm:size-9 [&_svg]:size-4 sm:[&_svg]:size-5", toneCls.bg, toneCls.text)}>{icon}</div>}
        </div>
        <div className={cn("mt-3 break-words text-xl font-semibold leading-tight tracking-tight tabular-nums sm:text-2xl [overflow-wrap:anywhere]", toneCls.value)}>{value}</div>
        {(hint || trend) && <div className="mt-3 space-y-1 border-t border-slate-100 pt-3">
          {hint && <div className={cn("text-xs leading-5", toneCls.muted)}>{hint}</div>}
          {trend && <p className={cn("text-xs font-medium leading-5", trend.direction === "up" && "text-emerald-700", trend.direction === "down" && "text-red-700", trend.direction === "flat" && "text-slate-500")}>
            {trend.direction === "up" && "\u2191 "}{trend.direction === "down" && "\u2193 "}{trend.text}
          </p>}
        </div>}
        <span aria-hidden="true" className="mt-auto pt-4"><span className="block h-0.5 w-6 rounded-full bg-accent/60" /></span>
      </CardContent>
    </Card>
  );
}
