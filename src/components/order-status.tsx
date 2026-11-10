import { STATUS_LABEL, type OrderStatus } from "@/lib/market";
import { cn } from "@/lib/utils";

const TONE: Record<OrderStatus, string> = {
  requested: "bg-secondary text-secondary-foreground",
  awaiting_payment: "bg-primary text-primary-foreground",
  payment_review: "bg-star text-background",
  in_progress: "bg-link text-background",
  delivered: "bg-merged text-merged-foreground",
  completed: "bg-success text-success-foreground",
  declined: "bg-destructive text-destructive-foreground",
  cancelled: "bg-muted text-muted-foreground",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", TONE[status])}>{STATUS_LABEL[status]}</span>;
}
