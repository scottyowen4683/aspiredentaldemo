import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/context/UserContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, RefreshCw, Loader2, Eye, Filter, Calendar, User, Bot, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/supabaseClient";
import { ScrollArea } from "@/components/ui/scroll-area";

interface AuditLog {
  id: string;
  org_id: string | null;
  user_id: string | null;
  assistant_id: string | null;
  action: string;
  details: any;
  created_at: string;
  organizations?: { name: string };
  assistants?: { friendly_name: string };
  users?: { full_name: string; email: string };
}

interface AuditLogsFilters {
  search?: string;
  org_id?: string;
  assistant_id?: string;
  action?: string;
  date_from?: string;
  date_to?: string;
}

export default function AuditLogs() {
  const { user } = useUser();
  const [filters, setFilters] = useState<AuditLogsFilters>({});
  const [showFilters, setShowFilters] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Only super admins can access this page
  if (user?.role !== 'super_admin') {
    return (
      <DashboardLayout userRole="org_admin" userName={user?.full_name || "User"}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-destructive mb-2">Access Denied</p>
            <p className="text-sm text-muted-foreground">
              This page is only accessible to super administrators.
            </p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Fetch audit logs with filters and pagination
  const { data: auditLogsData, isLoading, error, refetch } = useQuery({
    queryKey: ['audit-logs', filters, currentPage, pageSize],
    queryFn: async () => {
      // Build count query
      let countQuery = supabase.from('audit_logs').select('*', { count: 'exact', head: true });
      if (filters.search) {
        countQuery = countQuery.or(`action.ilike.%${filters.search}%,details->>message.ilike.%${filters.search}%`);
      }
      if (filters.org_id && filters.org_id !== 'all') {
        countQuery = countQuery.eq('org_id', filters.org_id);
      }
      if (filters.assistant_id && filters.assistant_id !== 'all') {
        countQuery = countQuery.eq('assistant_id', filters.assistant_id);
      }
      if (filters.action && filters.action !== 'all') {
        countQuery = countQuery.eq('action', filters.action);
      }
      if (filters.date_from) {
        countQuery = countQuery.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        countQuery = countQuery.lte('created_at', filters.date_to + 'T23:59:59');
      }

      const { count, error: countError } = await countQuery;

      if (countError) {
        console.log('Audit logs count query failed:', countError.message);
        // Return empty if table doesn't exist
        return { data: [], count: 0, totalPages: 0 };
      }

      // Build data query - try with joins first, fallback to simple query
      const from = (currentPage - 1) * pageSize;
      const to = from + pageSize - 1;

      // First try with joins
      let dataQuery = supabase
        .from('audit_logs')
        .select(`
          *,
          organizations(name),
          assistants(friendly_name),
          users(full_name, email)
        `)
        .order('created_at', { ascending: false });

      if (filters.search) {
        dataQuery = dataQuery.or(`action.ilike.%${filters.search}%,details->>message.ilike.%${filters.search}%`);
      }
      if (filters.org_id && filters.org_id !== 'all') {
        dataQuery = dataQuery.eq('org_id', filters.org_id);
      }
      if (filters.assistant_id && filters.assistant_id !== 'all') {
        dataQuery = dataQuery.eq('assistant_id', filters.assistant_id);
      }
      if (filters.action && filters.action !== 'all') {
        dataQuery = dataQuery.eq('action', filters.action);
      }
      if (filters.date_from) {
        dataQuery = dataQuery.gte('created_at', filters.date_from);
      }
      if (filters.date_to) {
        dataQuery = dataQuery.lte('created_at', filters.date_to + 'T23:59:59');
      }

      dataQuery = dataQuery.range(from, to);

      let { data, error: dataError } = await dataQuery;

      // If join query fails, try without joins
      if (dataError) {
        console.log('Audit logs join query failed, trying without joins:', dataError.message);

        let simpleQuery = supabase
          .from('audit_logs')
          .select('*')
          .order('created_at', { ascending: false });

        if (filters.search) {
          simpleQuery = simpleQuery.or(`action.ilike.%${filters.search}%,details->>message.ilike.%${filters.search}%`);
        }
        if (filters.org_id && filters.org_id !== 'all') {
          simpleQuery = simpleQuery.eq('org_id', filters.org_id);
        }
        if (filters.assistant_id && filters.assistant_id !== 'all') {
          simpleQuery = simpleQuery.eq('assistant_id', filters.assistant_id);
        }
        if (filters.action && filters.action !== 'all') {
          simpleQuery = simpleQuery.eq('action', filters.action);
        }
        if (filters.date_from) {
          simpleQuery = simpleQuery.gte('created_at', filters.date_from);
        }
        if (filters.date_to) {
          simpleQuery = simpleQuery.lte('created_at', filters.date_to + 'T23:59:59');
        }

        simpleQuery = simpleQuery.range(from, to);

        const simpleResult = await simpleQuery;
        if (simpleResult.error) {
          console.log('Simple audit logs query also failed:', simpleResult.error.message);
          return { data: [], count: 0, totalPages: 0 };
        }

        // Manually fetch related data for display
        data = await Promise.all((simpleResult.data || []).map(async (log: any) => {
          let orgData = null;
          let assistantData = null;
          let userData = null;

          if (log.org_id) {
            const { data: org } = await supabase
              .from('organizations')
              .select('name')
              .eq('id', log.org_id)
              .single();
            orgData = org;
          }

          if (log.assistant_id) {
            const { data: assistant } = await supabase
              .from('assistants')
              .select('friendly_name')
              .eq('id', log.assistant_id)
              .single();
            assistantData = assistant;
          }

          if (log.user_id) {
            const { data: userRecord } = await supabase
              .from('users')
              .select('full_name, email')
              .eq('id', log.user_id)
              .single();
            userData = userRecord;
          }

          return {
            ...log,
            organizations: orgData,
            assistants: assistantData,
            users: userData
          };
        }));
      }

      console.log('📋 Audit logs fetched:', {
        count: data?.length,
        firstLog: data?.[0],
        orgName: data?.[0]?.organizations?.name
      });

      return {
        data: (data || []) as AuditLog[],
        count: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize)
      };
    },
    enabled: !!user,
  });

  const auditLogs = auditLogsData?.data || [];
  const totalCount = auditLogsData?.count || 0;
  const totalPages = auditLogsData?.totalPages || 0;

  // Fetch filter options
  const { data: organizations = [] } = useQuery({
    queryKey: ['audit-organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .order('name');

      if (error) throw new Error(`Failed to fetch organizations: ${error.message}`);
      return data;
    },
    enabled: !!user,
  });

  const { data: assistants = [] } = useQuery({
    queryKey: ['audit-assistants'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assistants')
        .select('id, friendly_name, org_id')
        .order('friendly_name');

      if (error) throw new Error(`Failed to fetch assistants: ${error.message}`);
      return data;
    },
    enabled: !!user,
  });

  // Get unique actions for filter
  const uniqueActions = Array.from(new Set(auditLogs.map(log => log.action))).sort();

  // Helper functions
  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const getActionColor = (action: string) => {
    if (action.includes('error') || action.includes('failed')) return 'destructive';
    if (action.includes('created') || action.includes('completed')) return 'default';
    if (action.includes('updated') || action.includes('processed')) return 'secondary';
    return 'outline';
  };

  const getActionIcon = (action: string) => {
    if (action.includes('whisper') || action.includes('transcription')) return <Bot className="h-4 w-4" />;
    if (action.includes('webhook') || action.includes('processed')) return <FileText className="h-4 w-4" />;
    if (action.includes('user') || action.includes('login')) return <User className="h-4 w-4" />;
    return <Eye className="h-4 w-4" />;
  };

  const handleRefresh = () => {
    refetch();
  };

  const clearFilters = () => {
    setFilters({});
    setCurrentPage(1); // Reset to first page when clearing filters
  };

  // Reset to first page when filters change
  const updateFilters = (newFilters: Partial<AuditLogsFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
    setCurrentPage(1);
  };

  const formatDetails = (details: any) => {
    if (!details) return 'No details';
    if (typeof details === 'string') return details;
    return JSON.stringify(details, null, 2);
  };

  return (
    <DashboardLayout userRole="super_admin" userName={user?.full_name || "Super Admin"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div>
            <h1 className="text-3xl lg:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
              Audit Logs
            </h1>
            <p className="text-muted-foreground mt-2">
              System activity and event tracking
            </p>
          </div>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="w-full sm:w-auto"
            >
              <Filter className="mr-2 h-4 w-4" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </Button>
            <Button onClick={handleRefresh} variant="outline" className="w-full sm:w-auto">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* stats card skeleton while loading */}
        {isLoading && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[...Array(4)].map((_, index) => (
              <Card key={index} className="shadow-card animate-pulse">
                <CardContent className="p-4 flex space-x-2">
                  <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
                  <div className="h-3  bg-muted rounded w-1/2"></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Stats Cards  while not loading*/}
        {!isLoading && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold text-foreground">
                    {totalCount}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Total Logs
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold text-foreground">
                    {auditLogs.filter(log => log.created_at > new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Last 24h
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold text-foreground">
                    {uniqueActions.length}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Action Types
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <div className="text-2xl font-bold text-foreground">
                    {new Set(auditLogs.map(log => log.org_id)).size}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Organizations
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}



        {/* Filters */}
        {showFilters && (
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-lg flex items-center">
                <Filter className="mr-2 h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Search</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search actions..."
                      value={filters.search || ""}
                      onChange={(e) => updateFilters({ search: e.target.value })}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Organization</label>
                  <Select
                    value={filters.org_id || "all"}
                    onValueChange={(value) => updateFilters({
                      org_id: value === "all" ? undefined : value
                    })}
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
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Assistant</label>
                  <Select
                    value={filters.assistant_id || "all"}
                    onValueChange={(value) => updateFilters({
                      assistant_id: value === "all" ? undefined : value
                    })}
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
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">Action Type</label>
                  <Select
                    value={filters.action || "all"}
                    onValueChange={(value) => updateFilters({
                      action: value === "all" ? undefined : value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="All Actions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Actions</SelectItem>
                      {uniqueActions.map((action) => (
                        <SelectItem key={action} value={action}>
                          {action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">From Date</label>
                  <Input
                    type="date"
                    value={filters.date_from || ""}
                    onChange={(e) => updateFilters({ date_from: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-foreground mb-2 block">To Date</label>
                  <Input
                    type="date"
                    value={filters.date_to || ""}
                    onChange={(e) => updateFilters({ date_to: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex space-x-2">
                <Button onClick={clearFilters} variant="outline" size="sm">
                  Clear Filters
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Audit Logs Table */}
        <Card className="shadow-card">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                {/* skeleton for table while loading */}
                <div className="w-full overflow-x-auto">
                  <Table>
                  
                    <TableBody>
                      {[...Array(6)].map((_, idx) => (
                        <TableRow key={idx} className="animate-pulse">
                          <TableCell>
                            <div className="h-4 bg-muted rounded w-40" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 bg-muted rounded w-32" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 bg-muted rounded w-28" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 bg-muted rounded w-28" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 bg-muted rounded w-36" />
                          </TableCell>
                          <TableCell>
                            <div className="h-4 bg-muted rounded w-48" />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-destructive mb-2">Failed to load audit logs</p>
                  <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
                  <Button onClick={handleRefresh} variant="outline">
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                </div>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <p className="text-muted-foreground mb-2">No audit logs found</p>
                  <p className="text-sm text-muted-foreground">
                    {Object.keys(filters).length > 0
                      ? "Try adjusting your filters"
                      : "Audit logs will appear here as system activity occurs"
                    }
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Timestamp</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Assistant</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Details</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {auditLogs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="hover:bg-gradient-card cursor-pointer"
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center space-x-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <span>{formatTimestamp(log.created_at)}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            {getActionIcon(log.action)}
                            <Badge variant={getActionColor(log.action)}>
                              {log.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const orgName = log.organizations?.name || 'N/A';
                            console.log('Organization display:', { org_id: log.org_id, orgName, org_data: log.organizations });
                            return orgName;
                          })()}
                        </TableCell>
                        <TableCell>
                          {log.assistants?.friendly_name || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {log.users?.full_name || log.users?.email || 'System'}
                        </TableCell>
                        <TableCell>
                          <div className="max-w-xs truncate">
                            {log.details?.message || 'View details'}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination Controls */}
        {totalCount > 0 && (
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:justify-between sm:space-y-0">
                <div className="flex items-center space-x-2">
                  <span className="text-sm text-muted-foreground">
                    Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalCount)} of {totalCount} results
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-muted-foreground">Rows per page:</span>
                    <Select
                      value={pageSize.toString()}
                      onValueChange={(value) => {
                        setPageSize(Number(value));
                        setCurrentPage(1); // Reset to first page when changing page size
                      }}
                    >
                      <SelectTrigger className="w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                        <SelectItem value="100">100</SelectItem>
                        <SelectItem value="200">200</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center space-x-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                      disabled={currentPage <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>

                    <div className="flex items-center space-x-1">
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage} of {totalPages}
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Log Details Modal */}
        {selectedLog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-2xl max-h-[80vh] shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Audit Log Details</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedLog(null)}
                  >
                    ✕
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Timestamp</label>
                      <div className="text-sm font-mono">
                        {formatTimestamp(selectedLog.created_at)}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Action</label>
                      <div>
                        <Badge variant={getActionColor(selectedLog.action)}>
                          {selectedLog.action.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                        </Badge>
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Organization</label>
                      <div className="text-sm">
                        {(() => {
                          const orgName = selectedLog.organizations?.name || 'N/A';
                          console.log('Modal org display:', { org_id: selectedLog.org_id, orgName, org_data: selectedLog.organizations });
                          return orgName;
                        })()}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Assistant</label>
                      <div className="text-sm">
                        {selectedLog.assistants?.friendly_name || 'N/A'}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">User</label>
                    <div className="text-sm">
                      {selectedLog.users?.full_name || selectedLog.users?.email || 'System'}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Details</label>
                    <ScrollArea className="h-64 w-full border rounded p-3">
                      <pre className="text-xs whitespace-pre-wrap">
                        {formatDetails(selectedLog.details)}
                      </pre>
                    </ScrollArea>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-muted-foreground">Log ID</label>
                    <div className="text-xs font-mono text-muted-foreground">
                      {selectedLog.id}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}