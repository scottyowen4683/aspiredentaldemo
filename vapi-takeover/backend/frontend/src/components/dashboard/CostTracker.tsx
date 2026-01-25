import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  BarChart3,
  PieChart
} from 'lucide-react';
import { CostBreakdown } from '@/hooks/useAssistantPerformance';
import { cn } from '@/lib/utils';

interface CostTrackerProps {
  costData: CostBreakdown[];
  totalCost: number;
  loading: boolean;
  error: string | null;
  costLimit?: number; // Optional monthly cost limit
  className?: string;
}

export const CostTracker: React.FC<CostTrackerProps> = ({ 
  costData, 
  totalCost, 
  loading, 
  error, 
  costLimit = 1000, // Default $1000 monthly limit
  className 
}) => {
  const getCostTrend = () => {
    if (costData.length < 7) return null;
    
    const recentWeek = costData.slice(-7).reduce((sum, day) => sum + day.totalCost, 0);
    const previousWeek = costData.slice(-14, -7).reduce((sum, day) => sum + day.totalCost, 0);
    
    if (previousWeek === 0) return null;
    
    const trend = ((recentWeek - previousWeek) / previousWeek) * 100;
    return {
      value: Math.abs(trend),
      isPositive: trend >= 0
    };
  };

  const getCostBreakdownPercentages = () => {
    if (totalCost === 0) return { llm: 0, ttsStC: 0, vapi: 0, other: 0 };
    
    const totalLlm = costData.reduce((sum, day) => sum + day.llmCost, 0);
    const totalTtsStC = costData.reduce((sum, day) => sum + day.ttsStCost, 0);
    const totalVapi = costData.reduce((sum, day) => sum + day.vapiCost, 0);
    const totalOther = totalCost - totalLlm - totalTtsStC - totalVapi;
    
    return {
      llm: Math.round((totalLlm / totalCost) * 100),
      ttsStC: Math.round((totalTtsStC / totalCost) * 100),
      vapi: Math.round((totalVapi / totalCost) * 100),
      other: Math.round((totalOther / totalCost) * 100)
    };
  };

  const costUtilization = (totalCost / costLimit) * 100;
  const isOverBudget = totalCost > costLimit;
  const isNearBudget = costUtilization > 80 && !isOverBudget;
  const trend = getCostTrend();
  const breakdown = getCostBreakdownPercentages();

  if (loading) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Cost Tracking</CardTitle>
          <CardDescription>Monthly spend analysis and budget monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            <div className="space-y-4">
              <Skeleton className="h-8 w-32" />
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-6 w-20" />
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Cost Tracking</CardTitle>
          <CardDescription>Monthly spend analysis and budget monitoring</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
              <h3 className="font-semibold text-destructive">Failed to load cost data</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <DollarSign className="h-5 w-5 text-primary" />
            <span>Cost Tracking</span>
          </div>
          {(isOverBudget || isNearBudget) && (
            <Badge 
              variant={isOverBudget ? "destructive" : "outline"}
              className={cn(
                "text-xs",
                !isOverBudget && "bg-warning/10 text-warning border-warning/20"
              )}
            >
              {isOverBudget ? "Over Budget" : "Near Limit"}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Monthly spend analysis and budget monitoring</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Total Cost and Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-2xl font-bold text-foreground">
                ${totalCost.toFixed(2)}
              </h3>
              <p className="text-sm text-muted-foreground">
                of ${costLimit.toFixed(2)} monthly budget
              </p>
            </div>
            
            {trend && (
              <div className={cn(
                "flex items-center space-x-1 text-sm",
                trend.isPositive ? "text-destructive" : "text-success"
              )}>
                {trend.isPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{trend.value.toFixed(1)}% vs last week</span>
              </div>
            )}
          </div>
          
          <Progress 
            value={Math.min(costUtilization, 100)} 
            className={cn(
              "h-3",
              isOverBudget && "progress-destructive",
              isNearBudget && "progress-warning"
            )}
          />
          
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>0</span>
            <span>{costUtilization.toFixed(1)}% used</span>
            <span>${costLimit.toFixed(0)}</span>
          </div>
        </div>

        {/* Cost Breakdown */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <PieChart className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold text-foreground">Cost Breakdown</h4>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">LLM Costs</span>
                <span className="text-sm font-medium text-foreground">{breakdown.llm}%</span>
              </div>
              <Progress value={breakdown.llm} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">TTS/STT</span>
                <span className="text-sm font-medium text-foreground">{breakdown.ttsStC}%</span>
              </div>
              <Progress value={breakdown.ttsStC} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">VAPI</span>
                <span className="text-sm font-medium text-foreground">{breakdown.vapi}%</span>
              </div>
              <Progress value={breakdown.vapi} className="h-2" />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Other</span>
                <span className="text-sm font-medium text-foreground">{breakdown.other}%</span>
              </div>
              <Progress value={breakdown.other} className="h-2" />
            </div>
          </div>
        </div>

        {/* Recent Activity Summary */}
        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
            <h4 className="font-semibold text-foreground">Recent Activity</h4>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="p-3 rounded-lg bg-gradient-subtle">
              <div className="text-lg font-semibold text-foreground">
                {costData.slice(-7).reduce((sum, day) => sum + day.conversationCount, 0)}
              </div>
              <div className="text-xs text-muted-foreground">Conversations</div>
              <div className="text-xs text-muted-foreground">Last 7 days</div>
            </div>
            
            <div className="p-3 rounded-lg bg-gradient-subtle">
              <div className="text-lg font-semibold text-foreground">
                ${costData.slice(-7).reduce((sum, day) => sum + day.totalCost, 0).toFixed(2)}
              </div>
              <div className="text-xs text-muted-foreground">Weekly Cost</div>
              <div className="text-xs text-muted-foreground">Last 7 days</div>
            </div>
            
            <div className="p-3 rounded-lg bg-gradient-subtle">
              <div className="text-lg font-semibold text-foreground">
                ${costData.length > 0 
                  ? (costData.reduce((sum, day) => sum + day.totalCost, 0) / 
                     costData.filter(day => day.conversationCount > 0).length).toFixed(3)
                  : '0.000'
                }
              </div>
              <div className="text-xs text-muted-foreground">Avg per Conv</div>
              <div className="text-xs text-muted-foreground">This month</div>
            </div>
          </div>
        </div>

        {/* Budget Alert */}
        {(isOverBudget || isNearBudget) && (
          <div className={cn(
            "p-4 rounded-lg border",
            isOverBudget 
              ? "bg-destructive/5 border-destructive/20 text-destructive" 
              : "bg-warning/5 border-warning/20 text-warning"
          )}>
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-4 w-4" />
              <span className="font-medium">
                {isOverBudget 
                  ? `Budget exceeded by $${(totalCost - costLimit).toFixed(2)}` 
                  : `Approaching budget limit (${costUtilization.toFixed(1)}% used)`
                }
              </span>
            </div>
            <p className="text-xs mt-1 opacity-80">
              Consider reviewing assistant settings or increasing the budget limit.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};