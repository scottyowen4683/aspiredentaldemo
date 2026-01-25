import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckCircle2, XCircle, AlertCircle, Eye, Clock, User, Bot, Building2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/context/UserContext";
import { useReviewQueueItems, useReviewQueueStats } from "@/hooks/useReviewQueue";
import { ReviewForm } from "@/components/ReviewForm";
import { supabase } from "@/supabaseClient";
import type { ReviewQueueItem } from "@/services/reviewQueueService";

interface Organization {
  id: string;
  name: string;
}

export default function ReviewQueue() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');
  
  // Check for orgId in URL params (from Organizations page links)
  const urlOrgId = searchParams.get('orgId');
  
  // Get user's organization ID or selected org for super_admin
  const orgId = user?.role === 'super_admin' ? selectedOrgId : (user?.org_id || '');
  
  // Show loading if no user yet
  if (!user) {
    return (
      <DashboardLayout userRole="org_admin" userName="Loading...">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading user data...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Fetch organizations for super_admin
  useEffect(() => {
    if (user?.role === 'super_admin') {
      const fetchOrganizations = async () => {
        const { data, error } = await supabase
          .from('organizations')
          .select('id, name')
          .order('name');
        
        if (!error && data) {
          setOrganizations(data);
          // Auto-select org from URL or first org if none selected
          if (!selectedOrgId && data.length > 0) {
            const initialOrgId = urlOrgId || data[0].id;
            setSelectedOrgId(initialOrgId);
          }
        }
      };
      
      fetchOrganizations();
    }
  }, [user, selectedOrgId, urlOrgId]);

  // For org_admin, require org_id
  if (user.role === 'org_admin' && !user.org_id) {
    return (
      <DashboardLayout userRole={user.role as any} userName={user.full_name || user.email}>
        <div className="flex items-center justify-center py-12">
          <Card className="max-w-md">
            <CardHeader>
              <CardTitle className="text-destructive">Authentication Issue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p>User is authenticated but missing org_id:</p>
              <pre className="bg-muted p-3 rounded text-xs overflow-auto">
                {JSON.stringify(user, null, 2)}
              </pre>
              <p className="text-sm text-muted-foreground">
                Please contact your administrator to assign you to an organization.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }
  
  // Fetch dynamic data
  const { 
    data: pendingResult, 
    isLoading: pendingLoading, 
    error: pendingError,
    refetch: refetchPending
  } = useReviewQueueItems(orgId, false);
  
  const { 
    data: reviewedResult, 
    isLoading: reviewedLoading, 
    error: reviewedError 
  } = useReviewQueueItems(orgId, true);
  
  const { 
    data: statsResult, 
    isLoading: statsLoading 
  } = useReviewQueueStats(orgId);

  const pendingItems = pendingResult?.success ? pendingResult.data : [];
  const reviewedItems = reviewedResult?.success ? reviewedResult.data : [];
  const stats = statsResult?.success ? statsResult.data : null;

  // Debug logging
  console.log('Review Queue Debug:', {
    orgId,
    pendingLoading,
    pendingError,
    pendingResult,
    pendingItems: pendingItems.length,
    reviewedItems: reviewedItems.length
  });

  const ReviewCard = ({ item }: { item: ReviewQueueItem }) => {
    // Debug logging for missing data
    if (!item.conversation?.assistant?.friendly_name) {
      console.warn('Missing assistant name for item:', {
        itemId: item.id,
        conversationId: item.conversation?.id,
        assistantId: item.conversation?.assistant_id,
        assistant: item.conversation?.assistant
      });
    }
    
    if (!item.conversation?.organization?.name) {
      console.warn('Missing organization name for item:', {
        itemId: item.id,
        conversationId: item.conversation?.id,
        orgId: item.conversation?.org_id,
        organization: item.conversation?.organization
      });
    }

    return (
      <Card className="shadow-card hover:shadow-elegant transition-all">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-lg">
                {item.conversation?.assistant?.friendly_name || 
                 `Assistant (${item.conversation?.assistant_id?.slice(0, 8) || 'Unknown'})`}
              </CardTitle>
              <CardDescription className="mt-1">
                {item.conversation?.organization?.name || 
                 `Org (${item.conversation?.org_id?.slice(0, 8) || 'Unknown'})`} • {new Date(item.created_at).toLocaleString()}
              </CardDescription>
            </div>
          <Badge
            variant={
              (item.conversation?.confidence_score || 0) < 70
                ? "destructive"
                : (item.conversation?.confidence_score || 0) < 85
                  ? "secondary"
                  : "default"
            }
          >
            Confidence: {item.conversation?.confidence_score || 0}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Reason */}
        <div className="bg-gradient-card p-4 rounded-lg">
          <div className="flex items-start space-x-3">
            <AlertCircle className="h-5 w-5 text-warning mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-foreground">{item.reason}</p>
              {item.conversation?.final_ai_summary && (
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                  {item.conversation.final_ai_summary}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Score & Success */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Success Evaluation:</span>
          <Badge variant={item.conversation?.success_evaluation ? "default" : "destructive"}>
            {item.conversation?.success_evaluation ? "Success" : "Failed"}
          </Badge>
        </div>

        {/* Actions */}
        {!item.reviewed && (
          <div className="flex space-x-2 pt-2">
            <Button 
              className="flex-1"
              onClick={() => setSelectedReviewId(item.id)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Review
            </Button>
          </div>
        )}
        {item.reviewed && (
          <div className="space-y-2">
            <Badge className="w-full justify-center">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Reviewed
            </Badge>
            {item.reviewed_at && (
              <div className="flex items-center justify-center text-xs text-muted-foreground">
                <Clock className="mr-1 h-3 w-3" />
                {new Date(item.reviewed_at).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};


  // Normalize role for DashboardLayout prop: default to org_admin for non-super users
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  const handleReviewSuccess = () => {
    refetchPending();
    setSelectedReviewId(null);
  };

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
            Review Queue
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            Review flagged and low-confidence conversations
          </p>
        </div>

        {/* Organization Selector for Super Admin */}
        {user.role === 'super_admin' && (
          <Card className="shadow-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center space-x-2">
                <Building2 className="h-5 w-5" />
                <span>Organization</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Select
                value={selectedOrgId}
                onValueChange={setSelectedOrgId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select an organization" />
                </SelectTrigger>
                <SelectContent>
                  {organizations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!selectedOrgId && (
                <p className="text-sm text-muted-foreground mt-2">
                  Please select an organization to view its review queue.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Review
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {stats?.pending || pendingItems.length}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Reviewed Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {stats?.reviewedToday || 0}
                </div>
              )}
            </CardContent>
          </Card>
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Avg Review Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {stats?.avgReviewTime || "N/A"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Review Queue */}
        <Tabs defaultValue="pending" className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingItems.length})
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed ({reviewedItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {/* Debug Info */}
            <Card className="shadow-card bg-muted/30">
              <CardContent className="p-4">
                <div className="text-xs space-y-2">
                  <div><strong>Debug Info:</strong></div>
                  <div>Org ID: {orgId}</div>
                  <div>User Role: {user?.role}</div>
                  <div>Loading: {pendingLoading ? 'Yes' : 'No'}</div>
                  <div>Error: {pendingError ? JSON.stringify(pendingError) : 'None'}</div>
                  <div>Result Success: {pendingResult?.success ? 'Yes' : 'No'}</div>
                  <div>Items Count: {pendingItems.length}</div>
                </div>
              </CardContent>
            </Card>
            
            {pendingLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="shadow-card">
                    <CardHeader>
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="h-4 w-60" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-10 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pendingError ? (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-lg font-medium text-foreground">Error loading reviews</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {pendingError.message || 'Failed to load pending reviews'}
                  </p>
                  <Button onClick={() => refetchPending()} className="mt-4">
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : pendingItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {pendingItems.map((item) => (
                  <ReviewCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-success mb-4" />
                  <p className="text-lg font-medium text-foreground">All caught up!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No conversations pending review
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="reviewed" className="space-y-4">
            {reviewedLoading ? (
              <div className="grid gap-4 md:grid-cols-2">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i} className="shadow-card">
                    <CardHeader>
                      <Skeleton className="h-6 w-40" />
                      <Skeleton className="h-4 w-60" />
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-6 w-24" />
                      <Skeleton className="h-8 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : reviewedError ? (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-lg font-medium text-foreground">Error loading reviews</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Failed to load reviewed items
                  </p>
                </CardContent>
              </Card>
            ) : reviewedItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2">
                {reviewedItems.map((item) => (
                  <ReviewCard key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground">No reviewed items</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Reviewed conversations will appear here
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Review Form Modal */}
        <ReviewForm
          reviewId={selectedReviewId}
          userId={user?.id || ''}
          onClose={() => setSelectedReviewId(null)}
          onSuccess={handleReviewSuccess}
        />
      </div>
    </DashboardLayout>
  );
}
