import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  description?: string;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  variant?: "default" | "success" | "warning" | "destructive";
}

export function StatsCard({ title, value, description, icon: Icon, trend, variant = "default" }: StatsCardProps) {
  const variantClasses = {
    default: "bg-gradient-card",
    success: "bg-gradient-to-br from-success/10 to-success/5",
    warning: "bg-gradient-to-br from-warning/10 to-warning/5",
    destructive: "bg-gradient-to-br from-destructive/10 to-destructive/5",
  };

  const iconClasses = {
    default: "text-primary",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
  };

  return (
    <Card className={cn("shadow-card hover:shadow-elegant transition-all duration-200", variantClasses[variant])}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={cn("h-5 w-5", iconClasses[variant])} />
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold text-foreground">{value}</div>
        {(description || trend) && (
          <div className="flex items-center space-x-2 mt-2">
            {trend && (
              <span
                className={cn(
                  "text-xs font-medium",
                  trend.isPositive ? "text-success" : "text-destructive"
                )}
              >
                {trend.isPositive ? "+" : ""}
                {trend.value}%
              </span>
            )}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
