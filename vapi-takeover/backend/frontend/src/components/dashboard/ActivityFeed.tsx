import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  MessageSquare, 
  Bot, 
  Flag, 
  AlertTriangle,
  Clock,
  CheckCircle,
  XCircle,
  TrendingUp
} from 'lucide-react';
import { RecentActivity } from '@/hooks/useOrganizationMetrics';
import { cn } from '@/lib/utils';

interface ActivityFeedProps {
  activities: RecentActivity[];
  loading: boolean;
  error: string | null;
  className?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ 
  activities, 
  loading, 
  error, 
  className 
}) => {
  const getActivityIcon = (type: RecentActivity['type']) => {
    const iconClass = "h-4 w-4";
    switch (type) {
      case 'conversation':
        return <MessageSquare className={iconClass} />;
      case 'assistant':
        return <Bot className={iconClass} />;
      case 'review':
        return <Flag className={iconClass} />;
      case 'alert':
        return <AlertTriangle className={iconClass} />;
      default:
        return <Clock className={iconClass} />;
    }
  };

  const getActivityColor = (activity: RecentActivity) => {
    if (activity.type === 'alert') return 'text-destructive';
    if (activity.flagged) return 'text-warning';
    if (activity.score && activity.score >= 85) return 'text-success';
    if (activity.score && activity.score < 70) return 'text-destructive';
    return 'text-muted-foreground';
  };

  const getSentimentBadge = (sentiment: string) => {
    const sentimentConfig = {
      positive: { variant: 'default' as const, color: 'bg-success/10 text-success' },
      negative: { variant: 'destructive' as const, color: 'bg-destructive/10 text-destructive' },
      neutral: { variant: 'secondary' as const, color: 'bg-muted text-muted-foreground' }
    };
    
    const config = sentimentConfig[sentiment as keyof typeof sentimentConfig] || sentimentConfig.neutral;
    
    return (
      <Badge variant={config.variant} className={cn("text-xs", config.color)}>
        {sentiment}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
                <Skeleton className="h-6 w-16" />
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
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <XCircle className="mx-auto h-8 w-8 text-destructive mb-2" />
              <h3 className="font-semibold text-destructive">Failed to load activity</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!activities || activities.length === 0) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events in your organization</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <MessageSquare className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="font-semibold text-muted-foreground">No recent activity</h3>
              <p className="text-sm text-muted-foreground mt-1">Activity will appear here as conversations are processed</p>
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
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>Recent Activity</span>
        </CardTitle>
        <CardDescription>Latest events in your organization</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="flex items-center justify-between p-4 rounded-lg bg-gradient-card hover:shadow-card transition-all duration-200 border border-border/50"
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className={cn(
                  "p-2 rounded-full bg-muted/50",
                  getActivityColor(activity)
                )}>
                  {getActivityIcon(activity.type)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2 mb-1">
                    <h4 className="font-medium text-foreground truncate">
                      {activity.title}
                    </h4>
                    {activity.flagged && (
                      <Flag className="h-3 w-3 text-warning flex-shrink-0" />
                    )}
                  </div>
                  
                  <p className="text-sm text-muted-foreground truncate">
                    {activity.description}
                  </p>
                  
                  {activity.assistantName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Assistant: {activity.assistantName}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center space-x-3 flex-shrink-0">
                {activity.sentiment && getSentimentBadge(activity.sentiment)}
                
                {activity.score !== undefined && (
                  <div className="text-right">
                    <div className={cn(
                      "text-sm font-medium",
                      activity.score >= 85 ? "text-success" : 
                      activity.score >= 70 ? "text-warning" : "text-destructive"
                    )}>
                      {activity.score}%
                    </div>
                  </div>
                )}

                <div className="text-right text-xs text-muted-foreground">
                  {formatTimestamp(activity.timestamp)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};