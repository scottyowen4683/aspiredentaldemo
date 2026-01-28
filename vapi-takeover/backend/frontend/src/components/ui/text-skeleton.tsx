import { cn } from "@/lib/utils";

// Inline skeleton for text content that renders as span instead of div
export function TextSkeleton({ 
  className, 
  children,
  ...props 
}: React.HTMLAttributes<HTMLSpanElement> & { children?: React.ReactNode }) {
  return (
    <span 
      className={cn("inline-block animate-pulse rounded bg-muted", className)} 
      {...props}
    >
      {children || "Loading..."}
    </span>
  );
}

// Regular skeleton component (div)
export function Skeleton({ 
  className, 
  ...props 
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div 
      className={cn("animate-pulse rounded-md bg-muted", className)} 
      {...props} 
    />
  );
}