import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/context/UserContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, } from "@/components/ui/dropdown-menu";
import { Search, Filter, Download, RefreshCw, Loader2, Eye, Play, FileText, Calendar, AlertCircle } from "lucide-react";
import { analyzeConversationSentiment } from "@/services/analyticsService";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { useConversations, useConversationFilters, type ConversationsFilters } from "@/hooks/useConversations";
import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/text-skeleton";

export default function Conversations() {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Filter state
  const [filters, setFilters] = useState<ConversationsFilters>({
    page: 1,
    pageSize: 20
  });

  // Pagination handlers
  const handlePageChange = (newPage: number) => {
    setFilters(prev => ({ ...prev, page: newPage }));
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setFilters(prev => ({ ...prev, page: 1, pageSize: newPageSize }));
  };

  // Reset to page 1 when filters change (except page and pageSize)
  const resetToFirstPage = () => {
    if (filters.page && filters.page > 1) {
      setFilters(prev => ({ ...prev, page: 1 }));
    }
  };

  // Fetch data
  const { data: conversationsResponse, isLoading, error, refetch } = useConversations(filters);
  const { assistants, organizations, isLoading: filtersLoading } = useConversationFilters();

  // Extract data from response
  const conversations = conversationsResponse?.data || [];
  const total = conversationsResponse?.total || 0;
  const totalPages = conversationsResponse?.totalPages || 0;
  const currentPage = conversationsResponse?.currentPage || 1;
  const pageSize = conversationsResponse?.pageSize || 20;

  // Normalize role for DashboardLayout prop: default to org_admin for non-super users
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  // Helper functions
  const formatDuration = (seconds: number | null) => {
    if (!seconds && seconds !== 0) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins === 0 && secs === 0) return "N/A";
    return `${mins}m ${secs}s`;
  };

  const formatTimestamp = (timestamp: string, mobile: boolean = false) => {
    const date = new Date(timestamp);
    if (mobile) {
      // Shorter format for mobile: MM/DD HH:MM
      return date.toLocaleString('en-US', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });
    }
    return date.toLocaleString();
  };

  const getScoreVariant = (score: number | null) => {
    if (!score) return "secondary";
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  const getSentiment = (conversation: any) => {
    // Use smart sentiment analysis based on conversation data
    // This matches the logic in Analytics page for consistent sentiment display
    try {
      const sentiment = analyzeConversationSentiment({
        success: conversation.success_evaluation ?? conversation.success,
        overall_score: conversation.overall_score ?? conversation.confidence_score,
        end_reason: conversation.end_reason,
        transcript: conversation.transcript,
        duration_seconds: conversation.duration_seconds ?? conversation.call_duration
      });
      // Capitalize first letter for display
      return sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
    } catch {
      // Fallback to stored sentiment if analysis fails
      if (conversation.sentiment) return conversation.sentiment;
      if (conversation.transcript?.sentiment) return conversation.transcript.sentiment;
      return "Neutral"; // Default to neutral, not unknown
    }
  };

  const getSentimentVariant = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case "positive": return "default";
      case "neutral": return "secondary";
      case "negative": return "destructive";
      default: return "outline";
    }
  };

  const getScore = (conversation: any) => {
    // Support both overall_score (new) and confidence_score (legacy)
    return conversation.overall_score || conversation.confidence_score || null;
  };

  const isFlagged = (conversation: any) => {
    // Only flag if scored AND has actual issues AND not already reviewed
    if (!conversation.scored) return false;
    if (conversation.reviewed === true) return false; // Exclude reviewed conversations
    const score = getScore(conversation);
    // Flag if: low score OR explicitly failed success evaluation OR negative sentiment
    return (score !== null && score < 70) ||
           conversation.success_evaluation === false ||
           conversation.sentiment === 'negative';
  };

  const getConversationStatus = (conversation: any) => {
    const score = getScore(conversation);
    if (score > 0 && conversation.scored === true) {
      return isFlagged(conversation) ? 'Flagged' : 'Normal';
    }
    return 'Not Evaluated';
  };

  const getStatusVariant = (conversation: any) => {
    const score = getScore(conversation);
    if (score > 0 && conversation.scored === true) {
      return isFlagged(conversation) ? 'destructive' : 'outline';
    }
    return 'secondary';
  };

  const getDuration = (conversation: any) => {
    // Support both duration_seconds (new) and call_duration (legacy)
    return conversation.duration_seconds || conversation.call_duration || null;
  };

  const handleRefresh = async () => {
    try {
      // Refresh conversations data with current filters
      await refetch();

      // Also refresh filter options (assistants, organizations)
      await queryClient.invalidateQueries({ queryKey: ['conversation-assistants'] });
      await queryClient.invalidateQueries({ queryKey: ['conversation-organizations'] });

      // Optional: Could add a success toast here
      console.log('Conversations refreshed with current filters:', filters);
    } catch (error) {
      console.error('Failed to refresh conversations:', error);
      // Optional: Could add an error toast here
    }
  };

  const handleExport = (format: 'csv' | 'xlsx' | 'pdf') => {
    if (conversations.length === 0) {
      alert('No conversations to export');
      return;
    }

    // Prepare data for export
    const exportData = conversations.map(conv => ({
      'Timestamp': formatTimestamp(conv.created_at),
      'Assistant': conv.assistants?.friendly_name || "Unknown Assistant",
      'Organization': conv.organizations?.name || "Unknown Organization",
      'Phone': conv.customer_phone_number || "N/A",
      'Duration': formatDuration(getDuration(conv)),
      'Cost': conv.total_cost ? `$${conv.total_cost}` : "N/A",
      'Score': getScore(conv) ? `${getScore(conv)}%` : "N/A",
      'Sentiment': getSentiment(conv),
      'Status': isFlagged(conv) ? 'Flagged' : 'Normal',
      'Success': conv.success_evaluation ? 'Yes' : 'No'
    }));

    if (format === 'csv') {
      // Convert to CSV
      const headers = Object.keys(exportData[0]);
      const csvContent = [
        headers.join(','),
        ...exportData.map(row => headers.map(header => `"${row[header as keyof typeof row]}"`).join(','))
      ].join('\n');

      // Download CSV
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `conversations_${new Date().toISOString().split('T')[0]}.csv`;
      link.click();
    } else if (format === 'xlsx') {
      // For XLSX, we would need a library like xlsx
      alert('XLSX export would require additional library installation');
    } else if (format === 'pdf') {
      // For PDF, we would need a library like jsPDF
      alert('PDF export would require additional library installation');
    }
  };

  const handleRescore = () => {
    // TODO: Implement re-scoring functionality
    console.log("Re-score selected conversations");
  };


  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              Conversations
            </h1>
            <p className="text-muted-foreground mt-2">
              View and analyze all AI-scored conversations
            </p>
          </div>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onClick={() => handleExport('csv')}>
                  Export as CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('xlsx')}>
                  Export as XLSX
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleExport('pdf')}>
                  Export as PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={handleRefresh} disabled={isLoading} className="w-full sm:w-auto">
              <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="sm:inline">Refresh</span>
            </Button>
            <Button onClick={handleRescore} className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Re-score Selected</span>
              <span className="sm:hidden">Re-score</span>
            </Button>
          </div>
        </div>

        {/* skeleton for summary ststs in loading state */}
        {isLoading && (
          <div className="space-y-4">
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {[...Array(5)].map((_, index) => (
                <Card key={index} className="shadow-card">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...Array(4)].map((_, index) => (
                <Card key={index} className="shadow-card">
                  <CardContent className="p-4">
                    <Skeleton className="h-6 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        {!isLoading && conversations.length > 0 && (
          <div className="space-y-4">
            {/* Main Stats */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-foreground">
                      {total}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Total Conversations
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-foreground">
                      {conversations.filter(c => c.scored).length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Scored
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-foreground">
                      {conversations.filter(c => isFlagged(c)).length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Flagged
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-green-600">
                      {(() => {
                        const scored = conversations.filter(c => c.scored);
                        const successful = scored.filter(c => c.success_evaluation === true);
                        return scored.length > 0 ? Math.round((successful.length / scored.length) * 100) : 0;
                      })()}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      AI Success Rate
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-blue-600">
                      {(() => {
                        const withKb = conversations.filter(c => c.kb_used === true);
                        return conversations.length > 0 ? Math.round((withKb.length / conversations.length) * 100) : 0;
                      })()}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      KB Hit Rate
                    </div>
                  </div>
                </CardContent>
              </Card>
              {user?.role === "super_admin" && (
                <Card className="shadow-card">
                  <CardContent className="p-4">
                    <div className="flex items-center space-x-2">
                      <div className="text-2xl font-bold text-foreground">
                        ${conversations.reduce((sum, c) => sum + (c.total_cost || 0), 0).toFixed(2)}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        Total Cost
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Sentiment Stats */}
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-green-600">
                      {conversations.filter(c => getSentiment(c).toLowerCase() === 'positive').length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Positive Sentiment
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-yellow-600">
                      {conversations.filter(c => getSentiment(c).toLowerCase() === 'neutral').length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Neutral Sentiment
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-red-600">
                      {conversations.filter(c => getSentiment(c).toLowerCase() === 'negative').length}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Negative Sentiment
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <div className="text-2xl font-bold text-foreground">
                      {conversations.filter(c => getSentiment(c).toLowerCase() === 'positive').length > 0
                        ? Math.round((conversations.filter(c => getSentiment(c).toLowerCase() === 'positive').length / conversations.filter(c => getSentiment(c).toLowerCase() !== 'unknown').length) * 100)
                        : 0}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Positive Rate
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Needs Attention - Compact section for flagged conversations */}
            {conversations.filter(c => isFlagged(c)).length > 0 && (
              <Card className="shadow-card border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-amber-500" />
                      <span className="font-medium text-sm">Needs Attention</span>
                      <Badge variant="secondary" className="text-xs">
                        {conversations.filter(c => isFlagged(c)).length}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {conversations
                      .filter(c => isFlagged(c))
                      .slice(0, 8)
                      .map((conv) => (
                        <Button
                          key={conv.id}
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 hover:bg-amber-50 dark:hover:bg-amber-950"
                          onClick={() => navigate(`/conversations/${conv.id}`)}
                        >
                          <span className="truncate max-w-[120px]">
                            {conv.assistants?.friendly_name || "Unknown"}
                          </span>
                          {getScore(conv) && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                              {getScore(conv)}%
                            </Badge>
                          )}
                          {conv.sentiment === 'negative' && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0 h-4">
                              -
                            </Badge>
                          )}
                        </Button>
                      ))}
                    {conversations.filter(c => isFlagged(c)).length > 8 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setFilters(prev => ({ ...prev, status: 'flagged', page: 1 }))}
                      >
                        +{conversations.filter(c => isFlagged(c)).length - 8} more
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}

        {/* Enhanced Filters */}
        {/* hide filter in loading state */}
        {!filtersLoading && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Filter className="mr-2 h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Row 1: Basic Filters */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search conversations..."
                      className="pl-10"
                      value={filters.search || ""}
                      onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value, page: 1 }))}
                    />
                  </div>
                  <Select
                    value={filters.assistant_id || "all"}
                    onValueChange={(value) => setFilters(prev => ({
                      ...prev,
                      assistant_id: value === "all" ? undefined : value,
                      page: 1
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Assistants" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assistants</SelectItem>
                      {assistants.map((assistant) => (
                        <SelectItem key={assistant.id} value={assistant.id}>
                          {assistant.friendly_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {user?.role === "super_admin" && (
                    <Select
                      value={filters.org_id || "all"}
                      onValueChange={(value) => setFilters(prev => ({
                        ...prev,
                        org_id: value === "all" ? undefined : value,
                        page: 1
                      }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="All Organizations" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Organizations</SelectItem>
                        {organizations.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <Select
                    value={filters.flagged ? "flagged" : filters.low_confidence ? "low-confidence" : "all"}
                    onValueChange={(value) => {
                      if (value === "flagged") {
                        setFilters(prev => ({ ...prev, flagged: true, low_confidence: false, page: 1 }));
                      } else if (value === "low-confidence") {
                        setFilters(prev => ({ ...prev, flagged: false, low_confidence: true, page: 1 }));
                      } else {
                        setFilters(prev => ({ ...prev, flagged: false, low_confidence: false, page: 1 }));
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="flagged">Flagged Only</SelectItem>
                      <SelectItem value="low-confidence">Low Confidence</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Row 2: Advanced Filters */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">From Date</label>
                      <Input
                        type="date"
                        value={filters.date_from || ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, date_from: e.target.value, page: 1 }))}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">To Date</label>
                      <Input
                        type="date"
                        value={filters.date_to || ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, date_to: e.target.value, page: 1 }))}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Min Score</label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="0"
                        value={filters.score_min || ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, score_min: e.target.value ? parseInt(e.target.value) : undefined, page: 1 }))}
                        className="text-sm"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Max Score</label>
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        placeholder="100"
                        value={filters.score_max || ""}
                        onChange={(e) => setFilters(prev => ({ ...prev, score_max: e.target.value ? parseInt(e.target.value) : undefined, page: 1 }))}
                        className="text-sm"
                      />
                    </div>
                  </div>
                  <Select
                    value={filters.sentiment || "all"}
                    onValueChange={(value) => setFilters(prev => ({
                      ...prev,
                      sentiment: value === "all" ? undefined : value,
                      page: 1
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Sentiments" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sentiments</SelectItem>
                      <SelectItem value="positive">Positive</SelectItem>
                      <SelectItem value="neutral">Neutral</SelectItem>
                      <SelectItem value="negative">Negative</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={filters.escalation_status || "all"}
                    onValueChange={(value) => setFilters(prev => ({
                      ...prev,
                      escalation_status: value === "all" ? undefined : value,
                      page: 1
                    }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Escalations" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Escalations</SelectItem>
                      <SelectItem value="ai_handled">AI Handled</SelectItem>
                      <SelectItem value="human_handoff">Human Handoff</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={() => setFilters({ page: 1, pageSize: 20 })}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}



        {/* Conversations Table */}
        <Card className="shadow-card">
          <CardContent className="p-3 sm:p-6">
            {isLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, index) => (
                  <Skeleton key={index} className="h-10 w-full" />
                ))}
              </div>
              
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-destructive mb-2">Failed to load conversations</p>
                  <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
                  <Button onClick={handleRefresh} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-muted-foreground mb-2">No conversations found</p>
                  <p className="text-sm text-muted-foreground">
                    {Object.keys(filters).length > 0
                      ? "Try adjusting your filters"
                      : "Conversations will appear here once webhook data is processed"
                    }
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[800px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm">Timestamp</TableHead>
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm">Assistant</TableHead>
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm hidden md:table-cell">Phone</TableHead>
                          {user?.role === "super_admin" && <TableHead className="whitespace-nowrap text-xs sm:text-sm hidden lg:table-cell">Organization</TableHead>}
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm hidden md:table-cell">Duration</TableHead>
                          {user?.role === "super_admin" && <TableHead className="whitespace-nowrap text-xs sm:text-sm hidden xl:table-cell">Cost</TableHead>}
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm">Score</TableHead>
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm hidden md:table-cell">Sentiment</TableHead>
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm hidden sm:table-cell">Status</TableHead>
                          <TableHead className="whitespace-nowrap text-xs sm:text-sm">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {conversations.map((conv) => {
                          const sentiment = getSentiment(conv);
                          const flagged = isFlagged(conv);

                          return (
                            <TableRow
                              key={conv.id}
                              className="hover:bg-gradient-card cursor-pointer"
                              onClick={() => navigate(`/conversations/${conv.id}`)}
                            >
                              <TableCell className="font-medium text-xs sm:text-sm px-2 sm:px-4">
                                <div className="whitespace-nowrap">
                                  {formatTimestamp(conv.created_at, true)}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm px-2 sm:px-4">
                                <div className="max-w-[120px] sm:max-w-none truncate">
                                  {conv.assistants?.friendly_name || "Unknown"}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs sm:text-sm hidden md:table-cell px-2 sm:px-4">
                                <div className="max-w-[140px] truncate font-mono text-xs">
                                  {conv.customer_phone_number || "N/A"}
                                </div>
                              </TableCell>
                              {user?.role === "super_admin" && (
                                <TableCell className="text-xs sm:text-sm hidden lg:table-cell px-2 sm:px-4">
                                  <div className="max-w-[150px] truncate">
                                    {conv.organizations?.name || "Unknown Organization"}
                                  </div>
                                </TableCell>
                              )}
                              <TableCell className="text-xs sm:text-sm hidden md:table-cell px-2 sm:px-4">
                                {formatDuration(getDuration(conv))}
                              </TableCell>
                              {user?.role === "super_admin" && (
                                <TableCell className="text-xs sm:text-sm hidden xl:table-cell px-2 sm:px-4">
                                  {conv.total_cost ? `$${parseFloat(conv.total_cost).toFixed(4)}` : "N/A"}
                                </TableCell>
                              )}
                              <TableCell className="px-2 sm:px-4">
                                <Badge variant={getScoreVariant(getScore(conv))} className="text-xs">
                                  {getScore(conv) ? `${getScore(conv)}%` : "N/A"}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell px-2 sm:px-4">
                                <Badge variant={getSentimentVariant(sentiment)} className="text-xs">
                                  {sentiment}
                                </Badge>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell px-2 sm:px-4">
                                <Badge variant={getStatusVariant(conv)} className="text-xs">
                                  {getConversationStatus(conv)}
                                </Badge>
                              </TableCell>
                              <TableCell className="px-2 sm:px-4">
                                <div className="flex space-x-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/conversations/${conv.id}`);
                                    }}
                                    title="View Details"
                                    className="h-8 w-8 p-0"
                                  >
                                    <Eye className="h-3 w-3 sm:h-4 sm:w-4" />
                                  </Button>
                                  {(conv.recording_url || conv.stereo_recording_url) && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        // Play audio - placeholder for now
                                        const audioUrl = conv.stereo_recording_url || conv.recording_url;
                                        if (audioUrl) {
                                          window.open(audioUrl, '_blank');
                                        } else {
                                          alert('Audio playback would be implemented here');
                                        }
                                      }}
                                      title="Play Recording"
                                      className="h-8 w-8 p-0"
                                    >
                                      <Play className="h-3 w-3 sm:h-4 sm:w-4" />
                                    </Button>
                                  )}

                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
            )}
          </CardContent>

          {/* Pagination Controls */}
          {!isLoading && conversations.length > 0 && (
            <div className="px-6 py-4 border-t border-border">
              <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
                {/* Results info and page size selector */}
                <div className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, total)} of {total} conversations
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">Show</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => handlePageSizeChange(parseInt(value))}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="20">20</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-sm text-muted-foreground">per page</span>
                  </div>
                </div>

                {/* Pagination Navigation */}
                {totalPages > 1 && (
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious
                          onClick={() => currentPage > 1 && handlePageChange(currentPage - 1)}
                          className={currentPage <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>

                      {/* First page */}
                      {currentPage > 3 && (
                        <>
                          <PaginationItem>
                            <PaginationLink
                              onClick={() => handlePageChange(1)}
                              className="cursor-pointer"
                            >
                              1
                            </PaginationLink>
                          </PaginationItem>
                          {currentPage > 4 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                        </>
                      )}

                      {/* Page numbers around current page */}
                      {Array.from({ length: totalPages }, (_, i) => i + 1)
                        .filter(page =>
                          page >= Math.max(1, currentPage - 2) &&
                          page <= Math.min(totalPages, currentPage + 2)
                        )
                        .map(page => (
                          <PaginationItem key={page}>
                            <PaginationLink
                              onClick={() => handlePageChange(page)}
                              isActive={page === currentPage}
                              className="cursor-pointer"
                            >
                              {page}
                            </PaginationLink>
                          </PaginationItem>
                        ))}

                      {/* Last page */}
                      {currentPage < totalPages - 2 && (
                        <>
                          {currentPage < totalPages - 3 && (
                            <PaginationItem>
                              <PaginationEllipsis />
                            </PaginationItem>
                          )}
                          <PaginationItem>
                            <PaginationLink
                              onClick={() => handlePageChange(totalPages)}
                              className="cursor-pointer"
                            >
                              {totalPages}
                            </PaginationLink>
                          </PaginationItem>
                        </>
                      )}

                      <PaginationItem>
                        <PaginationNext
                          onClick={() => currentPage < totalPages && handlePageChange(currentPage + 1)}
                          className={currentPage >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </DashboardLayout>
  );
}
