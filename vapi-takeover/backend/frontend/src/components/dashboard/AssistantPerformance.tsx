import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Bot, 
  TrendingUp, 
  TrendingDown, 
  Play, 
  Pause, 
  AlertTriangle,
  DollarSign,
  MessageSquare,
  Flag
} from 'lucide-react';
import { AssistantPerformanceData } from '@/hooks/useAssistantPerformance';
import { cn } from '@/lib/utils';

interface AssistantPerformanceProps {
  assistants: AssistantPerformanceData[];
  loading: boolean;
  error: string | null;
  className?: string;
}

export const AssistantPerformance: React.FC<AssistantPerformanceProps> = ({ 
  assistants, 
  loading, 
  error, 
  className 
}) => {
  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-success';
    if (score >= 70) return 'text-warning';
    return 'text-destructive';
  };

  const getSentimentBadge = (sentiment: string) => {
    const sentimentConfig = {
      positive: 'bg-success/10 text-success border-success/20',
      negative: 'bg-destructive/10 text-destructive border-destructive/20',
      neutral: 'bg-muted/50 text-muted-foreground border-border'
    };
    
    const colorClass = sentimentConfig[sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral;
    
    return (
      <Badge variant="outline" className={cn("text-xs", colorClass)}>
        {sentiment}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Assistant Performance</CardTitle>
          <CardDescription>Individual assistant metrics and trends</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="p-4 border rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-6 w-16" />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <div key={j} className="space-y-2">
                      <Skeleton className="h-4 w-20" />
                      <Skeleton className="h-6 w-16" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Assistant Performance</CardTitle>
          <CardDescription>Individual assistant metrics and trends</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
              <h3 className="font-semibold text-destructive">Failed to load performance data</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!assistants || assistants.length === 0) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Assistant Performance</CardTitle>
          <CardDescription>Individual assistant metrics and trends</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <Bot className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="font-semibold text-muted-foreground">No assistants found</h3>
              <p className="text-sm text-muted-foreground mt-1">Create assistants to see performance metrics</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <Bot className="h-5 w-5 text-primary" />
          <span>Assistant Performance</span>
        </CardTitle>
        <CardDescription>Individual assistant metrics and trends</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {assistants.map((assistant) => (
            <div
              key={assistant.id}
              className="p-4 rounded-lg border border-border bg-gradient-card hover:shadow-card transition-all duration-200"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 rounded-full bg-primary/10">
                    <Bot className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">{assistant.friendlyName}</h3>
                    <div className="flex items-center space-x-2 mt-1">
                      {assistant.autoScore ? (
                        assistant.pauseAutoScore ? (
                          <Badge variant="outline" className="text-xs bg-warning/10 text-warning border-warning/20">
                            <Pause className="h-3 w-3 mr-1" />
                            Paused
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-success/10 text-success border-success/20">
                            <Play className="h-3 w-3 mr-1" />
                            Active
                          </Badge>
                        )
                      ) : (
                        <Badge variant="outline" className="text-xs bg-muted/50 text-muted-foreground">
                          Manual
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className={cn("text-2xl font-bold", getScoreColor(assistant.avgScore))}>
                    {assistant.avgScore}%
                  </div>
                  <p className="text-xs text-muted-foreground">Avg Score</p>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <MessageSquare className="h-3 w-3" />
                    <span>Conversations</span>
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {assistant.totalConversations}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>Sentiment</span>
                  </div>
                  <div>
                    {getSentimentBadge(assistant.avgSentiment)}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <Flag className="h-3 w-3" />
                    <span>Flagged</span>
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {assistant.flaggedConversations}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                    <DollarSign className="h-3 w-3" />
                    <span>Cost</span>
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    ${assistant.totalCost.toFixed(2)}
                  </div>
                </div>
              </div>

              {/* Score Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">Score Progress</span>
                  <span className="text-xs text-muted-foreground">{assistant.avgScore}%</span>
                </div>
                <Progress 
                  value={assistant.avgScore} 
                  className="h-2"
                />
              </div>

              {/* Quick trend indicators */}
              {assistant.trendsData && assistant.trendsData.length > 1 && (
                <div className="mt-3 pt-3 border-t border-border/50">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Recent Trend</span>
                    <div className="flex items-center space-x-2">
                      {(() => {
                        const recent = assistant.trendsData.slice(-7); // Last 7 days
                        const recentAvg = recent.reduce((sum, day) => sum + day.avgScore, 0) / recent.length;
                        const previous = assistant.trendsData.slice(-14, -7); // Previous 7 days
                        const previousAvg = previous.length > 0 
                          ? previous.reduce((sum, day) => sum + day.avgScore, 0) / previous.length 
                          : recentAvg;
                        
                        const trend = recentAvg - previousAvg;
                        const isPositive = trend >= 0;
                        
                        return (
                          <div className={cn(
                            "flex items-center space-x-1",
                            isPositive ? "text-success" : "text-destructive"
                          )}>
                            {isPositive ? (
                              <TrendingUp className="h-3 w-3" />
                            ) : (
                              <TrendingDown className="h-3 w-3" />
                            )}
                            <span>{isPositive ? '+' : ''}{trend.toFixed(1)}%</span>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};