import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertTriangle, 
  Bell, 
  DollarSign, 
  Flag, 
  TrendingDown,
  X,
  CheckCircle,
  Clock
} from 'lucide-react';
import { supabase } from '@/supabaseClient';
import { cn } from '@/lib/utils';

interface AlertItem {
  id: string;
  type: 'cost_warning' | 'performance_drop' | 'flagged_conversation' | 'system_alert';
  title: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: string;
  dismissed: boolean;
  metadata?: any;
}

interface AlertsPanelProps {
  orgId: string | null;
  className?: string;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ 
  orgId, 
  className 
}) => {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissingAlerts, setDismissingAlerts] = useState<Set<string>>(new Set());

  // Fetch alerts from multiple sources
  useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }

    const fetchAlerts = async () => {
      try {
        setLoading(true);
        setError(null);

        // Generate alerts based on current data
        const generatedAlerts: AlertItem[] = [];

        // 1. Check for cost warnings
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const { data: costData } = await supabase
          .from('conversations')
          .select('total_cost')
          .eq('org_id', orgId)
          .gte('created_at', startOfMonth.toISOString());

        if (costData) {
          const totalCost = costData.reduce((sum, conv) => sum + (conv.total_cost || 0), 0);
          const costLimit = 1000; // This could be configurable per org
          
          if (totalCost > costLimit * 0.9) {
            generatedAlerts.push({
              id: 'cost_warning_' + Date.now(),
              type: 'cost_warning',
              title: totalCost > costLimit ? 'Budget Exceeded' : 'Approaching Budget Limit',
              message: `Monthly cost is $${totalCost.toFixed(2)} (${((totalCost/costLimit)*100).toFixed(1)}% of $${costLimit} limit)`,
              severity: totalCost > costLimit ? 'critical' : 'high',
              timestamp: new Date().toISOString(),
              dismissed: false,
              metadata: { totalCost, costLimit, percentage: (totalCost/costLimit)*100 }
            });
          }
        }

        // 2. Check for performance drops
        const { data: recentScores } = await supabase
          .from('conversations')
          .select('confidence_score, created_at')
          .eq('org_id', orgId)
          .not('confidence_score', 'is', null)
          .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(50);

        if (recentScores && recentScores.length >= 10) {
          const avgScore = recentScores.reduce((sum, conv) => sum + (conv.confidence_score || 0), 0) / recentScores.length;
          
          if (avgScore < 70) {
            generatedAlerts.push({
              id: 'performance_drop_' + Date.now(),
              type: 'performance_drop',
              title: 'Performance Drop Detected',
              message: `Average conversation score dropped to ${avgScore.toFixed(1)}% this week`,
              severity: avgScore < 50 ? 'critical' : 'high',
              timestamp: new Date().toISOString(),
              dismissed: false,
              metadata: { avgScore, conversationCount: recentScores.length }
            });
          }
        }

        // 3. Check for flagged conversations
        const { data: flaggedData } = await supabase
          .from('review_queue')
          .select('id, created_at')
          .eq('org_id', orgId)
          .eq('reviewed', false)
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

        if (flaggedData && flaggedData.length > 5) {
          generatedAlerts.push({
            id: 'flagged_conversations_' + Date.now(),
            type: 'flagged_conversation',
            title: 'Multiple Conversations Flagged',
            message: `${flaggedData.length} conversations flagged for review in the last 24 hours`,
            severity: flaggedData.length > 10 ? 'high' : 'medium',
            timestamp: new Date().toISOString(),
            dismissed: false,
            metadata: { count: flaggedData.length }
          });
        }

        // 4. Check for system alerts from audit logs
        const { data: systemAlerts } = await supabase
          .from('audit_logs')
          .select('id, action, details, created_at')
          .eq('org_id', orgId)
          .in('action', ['auto_scoring_paused_cost_threshold', 'scoring_failed', 'assistant_error'])
          .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
          .order('created_at', { ascending: false })
          .limit(5);

        if (systemAlerts) {
          systemAlerts.forEach(alert => {
            generatedAlerts.push({
              id: alert.id,
              type: 'system_alert',
              title: getSystemAlertTitle(alert.action),
              message: getSystemAlertMessage(alert.action, alert.details),
              severity: getSystemAlertSeverity(alert.action),
              timestamp: alert.created_at,
              dismissed: false,
              metadata: alert.details
            });
          });
        }

        setAlerts(generatedAlerts.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        ));

      } catch (err) {
        console.error('Error fetching alerts:', err);
        setError(err instanceof Error ? err.message : 'Unknown error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchAlerts();

    // Set up real-time subscription for new alerts
    const subscription = supabase
      .channel('org_alerts')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'audit_logs',
        filter: `org_id=eq.${orgId}`
      }, fetchAlerts)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'review_queue',
        filter: `org_id=eq.${orgId}`
      }, fetchAlerts)
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [orgId]);

  const dismissAlert = async (alertId: string) => {
    setDismissingAlerts(prev => new Set(prev.add(alertId)));
    
    // Remove alert from local state
    setTimeout(() => {
      setAlerts(prev => prev.filter(alert => alert.id !== alertId));
      setDismissingAlerts(prev => {
        const newSet = new Set(prev);
        newSet.delete(alertId);
        return newSet;
      });
    }, 300);
  };

  const getAlertIcon = (type: AlertItem['type']) => {
    switch (type) {
      case 'cost_warning':
        return DollarSign;
      case 'performance_drop':
        return TrendingDown;
      case 'flagged_conversation':
        return Flag;
      case 'system_alert':
        return AlertTriangle;
      default:
        return Bell;
    }
  };

  const getSeverityColor = (severity: AlertItem['severity']) => {
    switch (severity) {
      case 'critical':
        return 'text-destructive border-destructive/20 bg-destructive/5';
      case 'high':
        return 'text-warning border-warning/20 bg-warning/5';
      case 'medium':
        return 'text-primary border-primary/20 bg-primary/5';
      case 'low':
        return 'text-muted-foreground border-border bg-muted/20';
      default:
        return 'text-muted-foreground border-border bg-muted/20';
    }
  };

  const getSeverityBadge = (severity: AlertItem['severity']) => {
    const config = {
      critical: { variant: 'destructive' as const, label: 'Critical', className: '' },
      high: { variant: 'outline' as const, label: 'High', className: 'border-warning/20 bg-warning/10 text-warning' },
      medium: { variant: 'outline' as const, label: 'Medium', className: 'border-primary/20 bg-primary/10 text-primary' },
      low: { variant: 'secondary' as const, label: 'Low', className: '' }
    };
    
    const { variant, label, className } = config[severity];
    
    return (
      <Badge variant={variant} className={cn("text-xs", className)}>
        {label}
      </Badge>
    );
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);

    if (diffMins < 60) {
      return `${diffMins}m ago`;
    } else if (diffHours < 24) {
      return `${diffHours}h ago`;
    } else {
      return date.toLocaleDateString();
    }
  };

  if (loading) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Alerts & Notifications</CardTitle>
          <CardDescription>Important updates and warnings</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
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
          <CardTitle>Alerts & Notifications</CardTitle>
          <CardDescription>Important updates and warnings</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load alerts: {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const activeAlerts = alerts.filter(alert => !alert.dismissed);

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Bell className="h-5 w-5 text-primary" />
            <span>Alerts & Notifications</span>
          </div>
          {activeAlerts.length > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeAlerts.length} active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>Important updates and warnings</CardDescription>
      </CardHeader>
      <CardContent>
        {activeAlerts.length === 0 ? (
          <div className="flex items-center justify-center p-8">
            <div className="text-center">
              <CheckCircle className="mx-auto h-8 w-8 text-success mb-2" />
              <h3 className="font-semibold text-success">All Clear!</h3>
              <p className="text-sm text-muted-foreground mt-1">No alerts at this time</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {activeAlerts.map((alert) => {
              const Icon = getAlertIcon(alert.type);
              return (
                <div
                  key={alert.id}
                  className={cn(
                    "p-4 rounded-lg border transition-all duration-200",
                    getSeverityColor(alert.severity),
                    dismissingAlerts.has(alert.id) && "opacity-50 scale-95"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3 flex-1">
                      <Icon className="h-5 w-5 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <h4 className="font-medium truncate">{alert.title}</h4>
                          {getSeverityBadge(alert.severity)}
                        </div>
                        <p className="text-sm opacity-90 mb-2">{alert.message}</p>
                        <div className="flex items-center space-x-2 text-xs opacity-75">
                          <Clock className="h-3 w-3" />
                          <span>{formatTimestamp(alert.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => dismissAlert(alert.id)}
                      disabled={dismissingAlerts.has(alert.id)}
                      className="flex-shrink-0 h-8 w-8 p-0 hover:bg-background/50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Helper functions for system alerts
function getSystemAlertTitle(action: string): string {
  const titleMap: Record<string, string> = {
    'auto_scoring_paused_cost_threshold': 'Auto-scoring Paused',
    'scoring_failed': 'Scoring Error',
    'assistant_error': 'Assistant Error'
  };
  
  return titleMap[action] || 'System Alert';
}

function getSystemAlertMessage(action: string, details: any): string {
  switch (action) {
    case 'auto_scoring_paused_cost_threshold':
      return 'Automatic scoring has been paused due to cost threshold exceeded';
    case 'scoring_failed':
      return `Scoring failed: ${details?.error_message || 'Unknown error'}`;
    case 'assistant_error':
      return `Assistant error: ${details?.error || 'Configuration issue'}`;
    default:
      return details?.message || 'System event occurred';
  }
}

function getSystemAlertSeverity(action: string): AlertItem['severity'] {
  const severityMap: Record<string, AlertItem['severity']> = {
    'auto_scoring_paused_cost_threshold': 'critical',
    'scoring_failed': 'high',
    'assistant_error': 'medium'
  };
  
  return severityMap[action] || 'medium';
}