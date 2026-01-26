import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell
} from 'recharts';
import { 
  TrendingUp, 
  BarChart3, 
  PieChart as PieChartIcon,
  AlertTriangle 
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface TrendsChartProps {
  data: Array<{
    date: string;
    conversations: number;
    avgScore: number;
    totalCost: number;
  }>;
  loading: boolean;
  error: string | null;
  className?: string;
  chartType?: 'line' | 'area' | 'bar';
  showCost?: boolean;
  showScore?: boolean;
  showConversations?: boolean;
}

export const TrendsChart: React.FC<TrendsChartProps> = ({ 
  data, 
  loading, 
  error, 
  className,
  chartType = 'area',
  showCost = false,
  showScore = true,
  showConversations = true
}) => {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric' 
    });
  };

  const formatTooltipValue = (value: number, name: string) => {
    if (name === 'totalCost') return `$${value.toFixed(2)}`;
    if (name === 'avgScore') return `${value.toFixed(1)}%`;
    return value.toString();
  };

  const formatTooltipLabel = (label: string) => {
    return new Date(label).toLocaleDateString('en-US', { 
      weekday: 'short',
      month: 'short', 
      day: 'numeric' 
    });
  };

  if (loading) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Performance Trends</CardTitle>
          <CardDescription>Daily metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Performance Trends</CardTitle>
          <CardDescription>Daily metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <AlertTriangle className="mx-auto h-8 w-8 text-destructive mb-2" />
              <h3 className="font-semibold text-destructive">Failed to load chart data</h3>
              <p className="text-sm text-muted-foreground mt-1">{error}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Performance Trends</CardTitle>
          <CardDescription>Daily metrics over time</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground mb-2" />
              <h3 className="font-semibold text-muted-foreground">No trend data available</h3>
              <p className="text-sm text-muted-foreground mt-1">Data will appear as conversations are processed</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const renderChart = () => {
    switch (chartType) {
      case 'line':
        return (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip 
              formatter={formatTooltipValue}
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            {showConversations && (
              <Line
                type="monotone"
                dataKey="conversations"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--primary))' }}
                name="Conversations"
              />
            )}
            {showScore && (
              <Line
                type="monotone"
                dataKey="avgScore"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--success))' }}
                name="Avg Score"
              />
            )}
            {showCost && (
              <Line
                type="monotone"
                dataKey="totalCost"
                stroke="hsl(var(--warning))"
                strokeWidth={2}
                dot={{ fill: 'hsl(var(--warning))' }}
                name="Total Cost"
              />
            )}
          </LineChart>
        );

      case 'bar':
        return (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip 
              formatter={formatTooltipValue}
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            {showConversations && (
              <Bar
                dataKey="conversations"
                fill="hsl(var(--primary))"
                name="Conversations"
                radius={[2, 2, 0, 0]}
              />
            )}
          </BarChart>
        );

      default: // area
        return (
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
            <XAxis 
              dataKey="date" 
              tickFormatter={formatDate}
              className="text-xs"
            />
            <YAxis className="text-xs" />
            <Tooltip 
              formatter={formatTooltipValue}
              labelFormatter={formatTooltipLabel}
              contentStyle={{
                backgroundColor: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '8px'
              }}
            />
            {showConversations && (
              <Area
                type="monotone"
                dataKey="conversations"
                stackId="1"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
                name="Conversations"
              />
            )}
            {showScore && (
              <Area
                type="monotone"
                dataKey="avgScore"
                stackId="2"
                stroke="hsl(var(--success))"
                fill="hsl(var(--success))"
                fillOpacity={0.3}
                name="Avg Score"
              />
            )}
          </AreaChart>
        );
    }
  };

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          <span>Performance Trends</span>
        </CardTitle>
        <CardDescription>Daily metrics over time</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {renderChart()}
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};

interface CostBreakdownChartProps {
  data: {
    llm: number;
    ttsStC: number;
    vapi: number; // Legacy name, represents platform costs
    other: number;
  };
  loading: boolean;
  className?: string;
}

export const CostBreakdownChart: React.FC<CostBreakdownChartProps> = ({ 
  data, 
  loading, 
  className 
}) => {
  const chartData = [
    { name: 'LLM', value: data.llm, color: 'hsl(var(--primary))' },
    { name: 'TTS/STT', value: data.ttsStC, color: 'hsl(var(--success))' },
    { name: 'Platform', value: data.vapi, color: 'hsl(var(--warning))' },
    { name: 'Other', value: data.other, color: 'hsl(var(--muted))' }
  ].filter(item => item.value > 0);

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-card border border-border rounded-lg p-2 shadow-lg">
          <p className="text-sm">
            {`${payload[0].name}: ${payload[0].value}%`}
          </p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <Card className={cn("shadow-card", className)}>
        <CardHeader>
          <CardTitle>Cost Breakdown</CardTitle>
          <CardDescription>Distribution of costs by service</CardDescription>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full rounded-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={cn("shadow-card", className)}>
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <PieChartIcon className="h-5 w-5 text-primary" />
          <span>Cost Breakdown</span>
        </CardTitle>
        <CardDescription>Distribution of costs by service</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                outerRadius={60}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        
        {/* Legend */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          {chartData.map((entry, index) => (
            <div key={entry.name} className="flex items-center space-x-2">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-sm text-muted-foreground">
                {entry.name}: {entry.value}%
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};