import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  CheckCircle2,
  XCircle,
  AlertCircle,
  Eye,
  Clock,
  Phone,
  MessageSquare,
  Building2,
  AlertTriangle,
  ThumbsDown,
  TrendingDown,
  Bot,
  User
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUser } from "@/context/UserContext";
import { useReviewQueueItems, useReviewQueueStats, useMarkReviewed, useConversationForReview } from "@/hooks/useReviewQueue";
import { supabase } from "@/supabaseClient";
import type { FlaggedConversation } from "@/services/reviewQueueService";

interface Organization {
  id: string;
  name: string;
}

export default function ReviewQueue() {
  const { user } = useUser();
  const [searchParams] = useSearchParams();
  const [selectedConversation, setSelectedConversation] = useState<FlaggedConversation | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>('');

  const urlOrgId = searchParams.get('orgId');
  const orgId = user?.role === 'super_admin' ? selectedOrgId : (user?.org_id || '');

  const markReviewedMutation = useMarkReviewed();

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
              <p>User is authenticated but missing organization assignment.</p>
              <p className="text-sm text-muted-foreground">
                Please contact your administrator to assign you to an organization.
              </p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Fetch flagged conversations
  const {
    data: pendingResult,
    isLoading: pendingLoading,
    error: pendingError,
    refetch: refetchPending
  } = useReviewQueueItems(orgId, false);

  const {
    data: reviewedResult,
    isLoading: reviewedLoading,
    error: reviewedError,
    refetch: refetchReviewed
  } = useReviewQueueItems(orgId, true);

  const {
    data: statsResult,
    isLoading: statsLoading
  } = useReviewQueueStats(orgId);

  const pendingItems = pendingResult?.success ? pendingResult.data : [];
  const reviewedItems = reviewedResult?.success ? reviewedResult.data : [];
  const stats = statsResult?.success ? statsResult.data : null;

  // Get flag reason for a conversation
  const getFlagReason = (conversation: FlaggedConversation): string => {
    const reasons: string[] = [];

    if (conversation.overall_score !== null && conversation.overall_score < 70) {
      reasons.push(`Low Score (${conversation.overall_score}%)`);
    }
    if (conversation.success_evaluation === false) {
      reasons.push("Failed Evaluation");
    }
    if (conversation.sentiment === 'negative') {
      reasons.push("Negative Sentiment");
    }

    return reasons.length > 0 ? reasons.join(" • ") : "Flagged for review";
  };

  // Handle marking as reviewed
  const handleMarkReviewed = async () => {
    if (!selectedConversation || !user) return;

    await markReviewedMutation.mutateAsync({
      conversationId: selectedConversation.id,
      type: selectedConversation.type,
      userId: user.id,
      notes: reviewNotes || undefined
    });

    setSelectedConversation(null);
    setReviewNotes("");
    refetchPending();
    refetchReviewed();
  };

  // Parse transcript for display
  const parseTranscript = (transcript: any): { role: string; message: string }[] => {
    if (!transcript) return [];

    try {
      const parsed = typeof transcript === 'string' ? JSON.parse(transcript) : transcript;

      // Handle conversation_flow format
      if (parsed.conversation_flow) {
        return parsed.conversation_flow
          .filter((msg: any) => msg.role !== 'system')
          .map((msg: any) => ({
            role: msg.role || msg.speaker || 'unknown',
            message: msg.message || msg.content || ''
          }));
      }

      // Handle messages array format
      if (Array.isArray(parsed)) {
        return parsed
          .filter((msg: any) => msg.role !== 'system')
          .map((msg: any) => ({
            role: msg.role || 'unknown',
            message: msg.content || msg.message || ''
          }));
      }

      // Handle {messages: []} format
      if (parsed.messages) {
        return parsed.messages
          .filter((msg: any) => msg.role !== 'system')
          .map((msg: any) => ({
            role: msg.role || 'unknown',
            message: msg.content || ''
          }));
      }

      return [];
    } catch (e) {
      return [];
    }
  };

  const ConversationCard = ({ item }: { item: FlaggedConversation }) => {
    const flagReason = getFlagReason(item);

    return (
      <Card className="shadow-card hover:shadow-elegant transition-all">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2">
              {item.type === 'voice' ? (
                <Phone className="h-4 w-4 text-blue-500" />
              ) : (
                <MessageSquare className="h-4 w-4 text-green-500" />
              )}
              <div>
                <CardTitle className="text-base">
                  {item.assistant?.friendly_name || `Assistant`}
                </CardTitle>
                <CardDescription className="text-xs mt-0.5">
                  {item.organization?.name} • {new Date(item.started_at).toLocaleDateString()}
                </CardDescription>
              </div>
            </div>
            <Badge
              variant={
                item.overall_score === null
                  ? "secondary"
                  : item.overall_score < 70
                    ? "destructive"
                    : item.overall_score < 85
                      ? "secondary"
                      : "default"
              }
            >
              {item.overall_score !== null ? `${item.overall_score}%` : 'N/A'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Flag Reason */}
          <div className="bg-destructive/10 p-3 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
              <p className="text-sm text-destructive font-medium">{flagReason}</p>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {item.success_evaluation !== null && (
              <div className="flex items-center gap-1">
                {item.success_evaluation ? (
                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                ) : (
                  <XCircle className="h-3 w-3 text-red-500" />
                )}
                <span>{item.success_evaluation ? "Success" : "Failed"}</span>
              </div>
            )}
            {item.sentiment && (
              <div className="flex items-center gap-1">
                {item.sentiment === 'positive' ? (
                  <span className="text-green-500">Positive</span>
                ) : item.sentiment === 'negative' ? (
                  <span className="text-red-500">Negative</span>
                ) : (
                  <span>Neutral</span>
                )}
              </div>
            )}
            {item.kb_used && (
              <div className="flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-blue-500" />
                <span>KB Used</span>
              </div>
            )}
          </div>

          {/* Summary */}
          {item.final_ai_summary && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {item.final_ai_summary}
            </p>
          )}

          {/* Actions */}
          {!item.reviewed ? (
            <Button
              className="w-full"
              size="sm"
              onClick={() => setSelectedConversation(item)}
            >
              <Eye className="mr-2 h-4 w-4" />
              Review
            </Button>
          ) : (
            <div className="space-y-2">
              <Badge className="w-full justify-center" variant="secondary">
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Reviewed
              </Badge>
              {item.reviewed_at && (
                <div className="flex items-center justify-center text-xs text-muted-foreground">
                  <Clock className="mr-1 h-3 w-3" />
                  {new Date(item.reviewed_at).toLocaleString()}
                </div>
              )}
              {item.review_notes && (
                <p className="text-xs text-muted-foreground italic">
                  "{item.review_notes}"
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
            Review Queue
          </h1>
          <p className="text-sm md:text-base text-muted-foreground mt-2">
            Review flagged conversations: low scores (&lt;70%), failed evaluations, or negative sentiment
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
            </CardContent>
          </Card>
        )}

        {/* Stats */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="shadow-card bg-gradient-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
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
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-red-500" />
                Total Flagged
              </CardTitle>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                <div className="text-3xl font-bold text-foreground">
                  {stats?.totalFlagged || 0}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Review Queue */}
        <Tabs defaultValue="pending" className="space-y-4">
          <TabsList>
            <TabsTrigger value="pending">
              Pending ({pendingItems.length})
            </TabsTrigger>
            <TabsTrigger value="reviewed">
              Reviewed ({reviewedItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="space-y-4">
            {pendingLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Card key={i} className="shadow-card">
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-12 w-full" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-9 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : pendingError ? (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <XCircle className="h-12 w-12 text-destructive mb-4" />
                  <p className="text-lg font-medium text-foreground">Error loading conversations</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Failed to load flagged conversations
                  </p>
                  <Button onClick={() => refetchPending()} className="mt-4">
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : pendingItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pendingItems.map((item) => (
                  <ConversationCard key={`${item.type}-${item.id}`} item={item} />
                ))}
              </div>
            ) : (
              <Card className="shadow-card">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
                  <p className="text-lg font-medium text-foreground">All caught up!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    No flagged conversations pending review
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="reviewed" className="space-y-4">
            {reviewedLoading ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i} className="shadow-card">
                    <CardHeader>
                      <Skeleton className="h-5 w-32" />
                      <Skeleton className="h-4 w-48" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-12 w-full" />
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
                  <Button onClick={() => refetchReviewed()} className="mt-4">
                    Try Again
                  </Button>
                </CardContent>
              </Card>
            ) : reviewedItems.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {reviewedItems.map((item) => (
                  <ConversationCard key={`${item.type}-${item.id}`} item={item} />
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

        {/* Review Dialog */}
        <Dialog open={!!selectedConversation} onOpenChange={(open) => !open && setSelectedConversation(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedConversation?.type === 'voice' ? (
                  <Phone className="h-5 w-5 text-blue-500" />
                ) : (
                  <MessageSquare className="h-5 w-5 text-green-500" />
                )}
                Review: {selectedConversation?.assistant?.friendly_name || 'Conversation'}
              </DialogTitle>
              <DialogDescription>
                {selectedConversation?.organization?.name} •{' '}
                {selectedConversation && new Date(selectedConversation.started_at).toLocaleString()}
              </DialogDescription>
            </DialogHeader>

            {selectedConversation && (
              <div className="flex-1 overflow-hidden flex flex-col gap-4">
                {/* Flag Reason */}
                <div className="bg-destructive/10 p-3 rounded-lg">
                  <div className="flex items-start space-x-2">
                    <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-destructive font-medium">
                      {getFlagReason(selectedConversation)}
                    </p>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/30 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold">
                      {selectedConversation.overall_score ?? 'N/A'}
                      {selectedConversation.overall_score !== null && '%'}
                    </div>
                    <div className="text-xs text-muted-foreground">Score</div>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg text-center">
                    <div className="text-2xl font-bold">
                      {selectedConversation.success_evaluation === true ? (
                        <CheckCircle2 className="h-6 w-6 text-green-500 mx-auto" />
                      ) : selectedConversation.success_evaluation === false ? (
                        <XCircle className="h-6 w-6 text-red-500 mx-auto" />
                      ) : (
                        'N/A'
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">Success</div>
                  </div>
                  <div className="bg-muted/30 p-3 rounded-lg text-center">
                    <div className="text-lg font-bold capitalize">
                      {selectedConversation.sentiment || 'N/A'}
                    </div>
                    <div className="text-xs text-muted-foreground">Sentiment</div>
                  </div>
                </div>

                {/* AI Summary */}
                {selectedConversation.final_ai_summary && (
                  <div>
                    <Label className="text-sm text-muted-foreground">AI Summary</Label>
                    <div className="bg-muted/30 p-3 rounded-lg mt-1">
                      <p className="text-sm">{selectedConversation.final_ai_summary}</p>
                    </div>
                  </div>
                )}

                {/* Transcript */}
                <div className="flex-1 min-h-0">
                  <Label className="text-sm text-muted-foreground">Transcript</Label>
                  <div className="border rounded-lg mt-1 h-48 overflow-hidden">
                    <ScrollArea className="h-full">
                      <div className="p-3 space-y-3">
                        {parseTranscript(selectedConversation.transcript).map((msg, i) => (
                          <div key={i} className="flex gap-2">
                            <div className="flex-shrink-0 mt-0.5">
                              {msg.role === 'user' ? (
                                <User className="h-4 w-4 text-blue-500" />
                              ) : (
                                <Bot className="h-4 w-4 text-green-500" />
                              )}
                            </div>
                            <div className="flex-1">
                              <span className="text-xs font-medium capitalize text-muted-foreground">
                                {msg.role}
                              </span>
                              <p className="text-sm mt-0.5">{msg.message}</p>
                            </div>
                          </div>
                        ))}
                        {parseTranscript(selectedConversation.transcript).length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-4">
                            No transcript available
                          </p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>

                {/* Review Notes */}
                <div>
                  <Label htmlFor="review-notes">Review Notes (optional)</Label>
                  <Textarea
                    id="review-notes"
                    placeholder="Add any notes about this review..."
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    className="mt-1"
                    rows={2}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedConversation(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleMarkReviewed}
                disabled={markReviewedMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {markReviewedMutation.isPending ? "Processing..." : "Mark as Reviewed"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
