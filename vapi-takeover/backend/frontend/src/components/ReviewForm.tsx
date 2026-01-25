import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle2, XCircle, AlertTriangle, User, Bot } from 'lucide-react';
import { useReviewQueueItem, useSubmitReview } from '@/hooks/useReviewQueue';
import { useToast } from '@/hooks/use-toast';
import type { ReviewFormData } from '@/services/reviewQueueService';

interface ReviewFormProps {
  reviewId: string | null;
  userId: string;
  onClose: () => void;
  onSuccess?: () => void;
}

interface TranscriptMessage {
  role: 'system' | 'bot' | 'user';
  message: string;
  speaker: string;
  timestamp: number;
}

export function ReviewForm({ reviewId, userId, onClose, onSuccess }: ReviewFormProps) {
  const { toast } = useToast();
  const { data: reviewItemResult, isLoading } = useReviewQueueItem(reviewId || '');
  const submitReviewMutation = useSubmitReview();
  
  const [formData, setFormData] = useState<ReviewFormData>({
    approved: false,
    updated_scores: undefined,
    updated_flags: undefined,
    confidence_override: undefined
  });

  const [editingScores, setEditingScores] = useState(false);
  const [editingFlags, setEditingFlags] = useState(false);
  const [tempScores, setTempScores] = useState<Record<string, number>>({});
  const [tempFlags, setTempFlags] = useState<Record<string, boolean>>({});

  if (!reviewId) return null;

  const reviewItem = reviewItemResult?.success ? reviewItemResult.data : null;

  const handleSubmit = async (approved: boolean) => {
    if (!reviewItem) return;

    const submitData: ReviewFormData = {
      approved,
      updated_scores: editingScores ? tempScores : undefined,
      updated_flags: editingFlags ? tempFlags : undefined,
      confidence_override: formData.confidence_override
    };

    try {
      await submitReviewMutation.mutateAsync({
        reviewId: reviewItem.id,
        scoreId: reviewItem.score_id,
        reviewData: submitData,
        userId
      });

      toast({
        title: approved ? "Review Approved" : "Review Rejected",
        description: `Conversation has been ${approved ? 'approved' : 'rejected'} and updated.`
      });

      onSuccess?.();
      onClose();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit review. Please try again.",
        variant: "destructive"
      });
    }
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getMessageIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'bot':
        return <Bot className="h-4 w-4 text-green-500" />;
      default:
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
    }
  };

  if (isLoading) {
    return (
      <Dialog open={!!reviewId} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <div className="flex items-center justify-center py-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-2 text-muted-foreground">Loading review details...</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!reviewItem) {
    return (
      <Dialog open={!!reviewId} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <div className="text-center py-8">
            <p className="text-destructive">Review item not found</p>
            <Button onClick={onClose} className="mt-4">Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // Parse transcript
  let transcript: { conversation_flow: TranscriptMessage[] } | null = null;
  try {
    transcript = typeof reviewItem.conversation?.transcript === 'string' 
      ? JSON.parse(reviewItem.conversation.transcript) 
      : reviewItem.conversation?.transcript;
  } catch (e) {
    console.error('Failed to parse transcript:', e);
  }

  const messages = transcript?.conversation_flow?.filter(msg => msg.role !== 'system') || [];

  return (
    <Dialog open={!!reviewId} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle className="text-xl">
            Review Conversation - {reviewItem.conversation?.assistant?.friendly_name || 
              `Assistant (${reviewItem.conversation?.assistant_id?.slice(0, 8) || 'Unknown'})`}
          </DialogTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{reviewItem.conversation?.organization?.name || 
              `Org (${reviewItem.conversation?.org_id?.slice(0, 8) || 'Unknown'})`}</span>
            <span>•</span>
            <span>ID: {reviewItem.conversation?.id}</span>
            <span>•</span>
            <span>{new Date(reviewItem.created_at).toLocaleString()}</span>
          </div>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left Column - Conversation Details */}
          <div className="flex-1 space-y-4 overflow-y-auto">
            {/* Issue Details */}
            <div className="bg-gradient-card p-4 rounded-lg">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="h-5 w-5 text-warning mt-0.5" />
                <div>
                  <p className="font-medium text-foreground">Review Reason</p>
                  <p className="text-sm text-muted-foreground mt-1">{reviewItem.reason}</p>
                </div>
              </div>
            </div>

            {/* Current Scores & Flags */}
            <div className="space-y-3">
              <h3 className="font-medium">Current Analysis</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-muted-foreground">Confidence Score</Label>
                  <div className="flex items-center gap-2">
                    <Badge variant={
                      (reviewItem.conversation?.confidence_score || 0) >= 70 ? "default" : "destructive"
                    }>
                      {reviewItem.conversation?.confidence_score || 0}%
                    </Badge>
                    <Input
                      type="number"
                      placeholder="Override"
                      className="w-20 h-8 text-xs"
                      min={0}
                      max={100}
                      value={formData.confidence_override || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        confidence_override: e.target.value ? Number(e.target.value) : undefined
                      }))}
                    />
                  </div>
                </div>
                
                <div>
                  <Label className="text-sm text-muted-foreground">Success Evaluation</Label>
                  <div>
                    <Badge variant={reviewItem.conversation?.success_evaluation ? "default" : "destructive"}>
                      {reviewItem.conversation?.success_evaluation ? "Success" : "Failed"}
                    </Badge>
                  </div>
                </div>
              </div>

              {/* Scores */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    Scores
                    {formData.updated_scores && (
                      <Badge variant="secondary" className="text-xs">Updated</Badge>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    {editingScores && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            updated_scores: tempScores
                          }));
                          setEditingScores(false);
                        }}
                      >
                        Update
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingScores(!editingScores);
                        if (!editingScores) {
                          setTempScores(reviewItem.score?.scores || {});
                        }
                      }}
                    >
                      {editingScores ? "Cancel" : "Edit"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  {Object.entries(reviewItem.score?.scores || {}).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                      {editingScores ? (
                        <Input
                          type="number"
                          className="w-20 h-8 text-xs"
                          min={0}
                          max={100}
                          value={tempScores[key] || (value as number)}
                          onChange={(e) => setTempScores(prev => ({
                            ...prev,
                            [key]: Number(e.target.value)
                          }))}
                        />
                      ) : (
                        <Badge variant="outline">{value as number}%</Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Flags */}
              <div>
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-muted-foreground flex items-center gap-2">
                    Flags
                    {formData.updated_flags && (
                      <Badge variant="secondary" className="text-xs">Updated</Badge>
                    )}
                  </Label>
                  <div className="flex gap-2">
                    {editingFlags && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setFormData(prev => ({
                            ...prev,
                            updated_flags: tempFlags
                          }));
                          setEditingFlags(false);
                        }}
                      >
                        Update
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setEditingFlags(!editingFlags);
                        if (!editingFlags) {
                          setTempFlags(reviewItem.score?.flags || {});
                        }
                      }}
                    >
                      {editingFlags ? "Cancel" : "Edit"}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2 mt-2">
                  {Object.entries(reviewItem.score?.flags || {}).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <span className="text-sm capitalize">{key.replace(/_/g, ' ')}</span>
                      {editingFlags ? (
                        <Checkbox
                          checked={tempFlags[key] !== undefined ? tempFlags[key] : value as boolean}
                          onCheckedChange={(checked) => setTempFlags(prev => ({
                            ...prev,
                            [key]: checked as boolean
                          }))}
                        />
                      ) : (
                        <Badge variant={value ? "destructive" : "default"}>
                          {value ? "Flagged" : "Clear"}
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Summary */}
            {reviewItem.conversation?.final_ai_summary && (
              <div>
                <Label className="text-sm text-muted-foreground">AI Summary</Label>
                <div className="bg-muted/30 p-3 rounded-lg mt-2">
                  <p className="text-sm">{reviewItem.conversation.final_ai_summary}</p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Transcript */}
          <div className="flex-1 min-w-0">
            <div className="space-y-3 h-full flex flex-col">
              <h3 className="font-medium">Conversation Transcript</h3>
              
              <div className="flex-1 border rounded-lg overflow-hidden">
                <ScrollArea className="h-full w-full">
                  <div className="p-4 space-y-4">
                    {messages.map((message, index) => (
                      <div key={index} className="flex space-x-3">
                        <div className="flex-shrink-0 mt-1">
                          {getMessageIcon(message.role)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-1">
                            <span className="text-sm font-medium capitalize">
                              {message.speaker}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(message.timestamp)}
                            </span>
                          </div>
                          <div className="text-sm bg-muted/30 rounded-lg p-3 break-words">
                            {message.message}
                          </div>
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No transcript available
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </div>
        </div>

        <Separator />

        {/* Actions */}
        <div className="flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => handleSubmit(false)}
              disabled={submitReviewMutation.isPending}
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
            >
              <XCircle className="mr-2 h-4 w-4" />
              {submitReviewMutation.isPending ? "Processing..." : "Reject & Re-score"}
            </Button>
            <Button
              onClick={() => handleSubmit(true)}
              disabled={submitReviewMutation.isPending}
              className="bg-success hover:bg-success/90"
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              {submitReviewMutation.isPending ? "Processing..." : "Approve"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}