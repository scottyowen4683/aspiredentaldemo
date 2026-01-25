import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useUser } from "@/context/UserContext";
import { useConversation } from "@/hooks/useConversation";
import { useConversationScore } from "@/hooks/useConversationScore";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  User,
  Bot,
  Play,
  Download,
  ExternalLink,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  TrendingUp,
  Flag,
  Heart,
  Brain,
  Target,
  Phone
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

interface TranscriptMessage {
  role: 'system' | 'bot' | 'user';
  message: string;
  speaker: string;
  timestamp: number;
}

interface CostBreakdown {
  llm?: number;
  stt?: number;
  tts?: number;
  chat?: number;
  vapi?: number;
  total?: number;
  transport?: number;
  ttsCharacters?: number;
  llmPromptTokens?: number;
  knowledgeBaseCost?: number;
  llmCompletionTokens?: number;
  // Text message cost fields (from VAPI session.costs array)
  model?: number;
  session?: number;
  analysis?: number;
  analysisCostBreakdown?: {
    summary: number;
    structuredData: number;
    structuredOutput: number;
    successEvaluation: number;
    summaryPromptTokens: number;
    summaryCompletionTokens: number;
    structuredDataPromptTokens: number;
    structuredOutputPromptTokens: number;
    successEvaluationPromptTokens: number;
    structuredDataCompletionTokens: number;
    structuredOutputCompletionTokens: number;
    successEvaluationCompletionTokens: number;
  };
  voicemailDetectionCost: number;
  // New Whisper transcription fields
  whisper_transcription?: number;
  whisper_duration_minutes?: number;
  // GPT Scoring costs
  gpt_scoring?: {
    llm: number;
    stt: number;
    tts: number;
    chat: number;
    vapi: number;
    total: number;
    transport: number;
    ttsCharacters: number;
    llmPromptTokens: number;
    knowledgeBaseCost: number;
    llmCompletionTokens: number;
    analysisCostBreakdown: {
      summary: number;
      structuredData: number;
      structuredOutput: number;
      successEvaluation: number;
      summaryPromptTokens: number;
      summaryCompletionTokens: number;
      structuredDataPromptTokens: number;
      structuredOutputPromptTokens: number;
      successEvaluationPromptTokens: number;
      structuredDataCompletionTokens: number;
      structuredOutputCompletionTokens: number;
      successEvaluationCompletionTokens: number;
    };
    voicemailDetectionCost: number;
  };
}

export default function ConversationDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useUser();
  const { data: conversation, isLoading, error } = useConversation(id!);
  const { data: scoreData, isLoading: scoreLoading } = useConversationScore(id!);

  // Normalize role for DashboardLayout prop
  const currentRole: "super_admin" | "org_admin" = user?.role === "super_admin" ? "super_admin" : "org_admin";

  // Helper functions
  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "N/A";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}m ${secs}s`;
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatCurrency = (amount: number | null | undefined) => {
    if (amount == null || isNaN(amount)) return "$0.0000";
    return `$${amount.toFixed(4)}`;
  };

  const getMessageIcon = (role: string) => {
    switch (role) {
      case 'user':
        return <User className="h-4 w-4 text-blue-500" />;
      case 'bot':
        return <Bot className="h-4 w-4 text-green-500" />;
      case 'system':
        return <AlertCircle className="h-4 w-4 text-amber-500" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-500" />;
    }
  };

  // Score helper functions
  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadgeVariant = (score: number) => {
    if (score >= 80) return "default";
    if (score >= 60) return "secondary";
    return "destructive";
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'neutral':
        return <Brain className="h-4 w-4 text-blue-500" />;
      case 'negative':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Brain className="h-4 w-4 text-gray-500" />;
    }
  };

  const getSentimentBadgeVariant = (sentiment: string) => {
    switch (sentiment.toLowerCase()) {
      case 'positive':
        return "default";
      case 'neutral':
        return "secondary";
      case 'negative':
        return "destructive";
      default:
        return "outline";
    }
  };

  const formatScoreName = (key: string) => {
    return key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getStatusIcon = (evaluation: boolean | null) => {
    if (evaluation === true) return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (evaluation === false) return <XCircle className="h-4 w-4 text-red-500" />;
    return <AlertCircle className="h-4 w-4 text-amber-500" />;
  };

  const getStatusText = (conversation: any) => {

    if (conversation.confidence_score > 0 && conversation.scored === true) {

      if (conversation.success_evaluation === true) return "Success";
      if (conversation.success_evaluation === false) return "Failed";
      return "Evaluated";
    }
    return "Not Evaluated";
  };

  const getStatusVariant = (conversation: any) => {
    if (conversation.confidence_score > 0 && conversation.scored === true) {
      if (conversation.success_evaluation === true) return "default";
      if (conversation.success_evaluation === false) return "destructive";
      return "outline";
    }
    return "secondary";
  };

  // Calculate actual total cost including all components
  const calculateActualTotal = (breakdown: CostBreakdown | null) => {
    if (!breakdown) return 0;

    let total = breakdown.total || 0;

    // Add GPT scoring costs
    if (breakdown.gpt_scoring && typeof breakdown.gpt_scoring.total === 'number' && breakdown.gpt_scoring.total > 0) {
      total += breakdown.gpt_scoring.total;
    }

    // Add Whisper transcription costs if not already included
    if (breakdown.whisper_transcription && typeof breakdown.whisper_transcription === 'number' && breakdown.whisper_transcription > 0) {
      total += breakdown.whisper_transcription;
    }

    // Ensure we return a valid number
    return isNaN(total) ? 0 : total;
  };

  if (isLoading) {
    return (
      // create skeleton of complete dashboard layout while loading

      <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
        <div className="space-y-6 animate-pulse">
          {/* Header skeleton */}
          <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-10 w-28 rounded" />
              <div>
                <Skeleton className="h-9 w-64 rounded" />
                <Skeleton className="h-4 w-40 mt-2 rounded" />
              </div>
            </div>
            <div className="flex space-x-3">
              <Skeleton className="h-10 w-28 rounded" />
              <Skeleton className="h-10 w-28 rounded" />
            </div>
          </div>

          {/* Overview cards skeleton */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Card key={i} className="shadow-card">
                <CardContent className="p-4">
                  <div className="flex items-center space-x-2">
                    <Skeleton className="h-5 w-5 rounded" />
                    <div className="flex-1">
                      <Skeleton className="h-6 w-28 rounded" />
                      <Skeleton className="h-3 w-20 mt-2 rounded" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Scoring results skeleton */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle><Skeleton className="h-5 w-40 rounded" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-4 w-32 rounded" />
                      <Skeleton className="h-5 w-12 rounded" />
                    </div>
                    <Skeleton className="h-2 w-full rounded" />
                  </div>
                ))}
                <Separator className="my-4" />
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-24 rounded" />
                  <Skeleton className="h-5 w-12 rounded" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle><Skeleton className="h-5 w-40 rounded" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-48 rounded" />
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-4 w-40 rounded" />
              </CardContent>
            </Card>

            <Card className="shadow-card">
              <CardHeader>
                <CardTitle><Skeleton className="h-5 w-40 rounded" /></CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <Skeleton className="h-4 w-32 rounded" />
                    <Skeleton className="h-4 w-12 rounded" />
                  </div>
                ))}
                <Separator className="my-4" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-44 rounded" />
                  <Skeleton className="h-3 w-40 rounded" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main content skeleton */}
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Skeleton className="h-5 w-5 rounded" />
                      <Skeleton className="h-5 w-40 rounded" />
                    </div>
                    <Skeleton className="h-5 w-16 rounded" />
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[400px] sm:h-[500px] lg:h-[600px] p-4">
                    <div className="space-y-4">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="flex space-x-3">
                          <div className="flex-shrink-0 mt-1">
                            <Skeleton className="h-4 w-4 rounded-full" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between mb-1">
                              <Skeleton className="h-4 w-32 rounded" />
                              <Skeleton className="h-3 w-24 rounded" />
                            </div>
                            <Skeleton className="h-12 w-full rounded-lg" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle><Skeleton className="h-5 w-24 rounded" /></CardTitle>
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-20 w-full rounded" />
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle><Skeleton className="h-5 w-32 rounded" /></CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex justify-between items-center text-sm">
                      <Skeleton className="h-4 w-28 rounded" />
                      <Skeleton className="h-4 w-20 rounded" />
                    </div>
                  ))}
                  <Separator />
                  <div className="flex justify-between font-medium">
                    <Skeleton className="h-5 w-24 rounded" />
                    <Skeleton className="h-5 w-20 rounded" />
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle><Skeleton className="h-5 w-28 rounded" /></CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-40 rounded" />
                  <Separator />
                  <Skeleton className="h-3 w-full rounded" />
                  <Skeleton className="h-3 w-full rounded" />
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DashboardLayout>

    );
  }

  if (error || !conversation) {
    return (
      <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <p className="text-destructive mb-2">{error?.message || "Conversation not found"}</p>
            <Button onClick={() => navigate('/conversations')} variant="outline">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Conversations
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Parse transcript and cost breakdown
  let transcript: { conversation_flow: TranscriptMessage[] } | null = null;
  let costBreakdown: CostBreakdown | null = null;

  try {
    transcript = typeof conversation.transcript === 'string'
      ? JSON.parse(conversation.transcript)
      : conversation.transcript;
  } catch (e) {
    console.error('Failed to parse transcript:', e);
  }

  try {
    costBreakdown = typeof conversation.cost_breakdown === 'string'
      ? JSON.parse(conversation.cost_breakdown)
      : conversation.cost_breakdown;
  } catch (e) {
    console.error('Failed to parse cost breakdown:', e);
  }

  const messages = transcript?.conversation_flow?.filter(msg => msg.role !== 'system') || [];

  return (
    <DashboardLayout userRole={currentRole} userName={user?.full_name || "Unknown User"}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col space-y-4 lg:flex-row lg:items-center lg:justify-between lg:space-y-0">
          <div className="flex flex-col space-y-4 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-4">
            <Button
              variant="outline"
              onClick={() => navigate('/conversations')}
              className="flex items-center w-fit"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl lg:text-4xl font-bold text-foreground bg-gradient-primary bg-clip-text text-transparent">
                Conversation Details
              </h1>
              <p className="text-muted-foreground mt-2">
                {conversation.assistants?.friendly_name || "Unknown Assistant"} • {formatTimestamp(new Date(conversation.created_at).getTime())}
              </p>
            </div>
          </div>
          <div className="flex flex-col space-y-2 sm:flex-row sm:space-y-0 sm:space-x-3">
            {conversation.recording_url && (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <a href={conversation.recording_url} target="_blank" rel="noopener noreferrer">
                  <Play className="mr-2 h-4 w-4" />
                  Play Recording
                </a>
              </Button>
            )}
            {conversation.log_url && (
              <Button variant="outline" asChild className="w-full sm:w-auto">
                <a href={conversation.log_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  View Logs
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {formatDuration(conversation.call_duration)}
                  </div>
                  <div className="text-sm text-muted-foreground">Duration</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {user?.role === "super_admin" && (
            <Card className="shadow-card">
              <CardContent className="p-4">
                <div className="flex items-center space-x-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      ${conversation.total_cost ? parseFloat(String(conversation.total_cost)).toFixed(2) : '0.00'}
                    </div>
                    <div className="text-sm text-muted-foreground">Total Cost</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <AlertCircle className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {conversation.confidence_score ? (
                      <Badge variant={conversation.confidence_score >= 80 ? "default" : conversation.confidence_score >= 60 ? "secondary" : "destructive"}>
                        {conversation.confidence_score}%
                      </Badge>
                    ) : (
                      <Badge variant="secondary">N/A</Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">Confidence Score</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                {getStatusIcon(conversation.success_evaluation)}
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    <Badge variant={getStatusVariant(conversation)}>
                      {getStatusText(conversation)}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">Evaluation</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <div className="text-sm">
                  <div className="text-lg font-bold text-foreground capitalize">
                    {conversation.provider}
                  </div>
                  <div className="text-sm text-muted-foreground">Provider</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {conversation.end_reason?.replace(/-/g, ' ') || 'Unknown'}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardContent className="p-4">
              <div className="flex items-center space-x-2">
                <Phone className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-2xl font-bold text-foreground font-mono">
                    {conversation.customer_phone_number || "N/A"}
                  </div>
                  <div className="text-sm text-muted-foreground">Customer Phone</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Scoring Details */}
        {scoreData && (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-bold text-foreground mb-4">AI Scoring Results</h2>
              <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">

                {/* Individual Scores */}
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Target className="mr-2 h-5 w-5" />
                      Performance Scores
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {Object.entries(scoreData.scores).map(([key, score]) => (
                      <div key={key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{formatScoreName(key)}</span>
                          <Badge variant={getScoreBadgeVariant(score)} className="font-mono">
                            {score}%
                          </Badge>
                        </div>
                        <Progress value={score} className="h-2" />
                      </div>
                    ))}
                    <Separator className="my-4" />
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">Average Score</span>
                      <Badge variant={getScoreBadgeVariant(
                        Math.round(Object.values(scoreData.scores).reduce((a, b) => a + b, 0) / Object.keys(scoreData.scores).length)
                      )} className="font-mono text-base">
                        {Math.round(Object.values(scoreData.scores).reduce((a, b) => a + b, 0) / Object.keys(scoreData.scores).length)}%
                      </Badge>
                    </div>
                  </CardContent>
                </Card>

                {/* Sentiment Analysis */}
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Heart className="mr-2 h-5 w-5" />
                      Sentiment Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Overall Sentiment</span>
                        <div className="flex items-center space-x-2">
                          {getSentimentIcon(scoreData.sentiments.overall_sentiment || 'neutral')}
                          <Badge variant={getSentimentBadgeVariant(scoreData.sentiments.overall_sentiment || 'neutral')}>
                            {scoreData.sentiments.overall_sentiment || 'Unknown'}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Emotional Tone</span>
                        <Badge variant="outline">
                          {scoreData.sentiments.emotional_tone || 'Unknown'}
                        </Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">Customer Satisfaction</span>
                        <Badge variant={
                          scoreData.sentiments.customer_satisfaction === 'high' ? 'default' :
                            scoreData.sentiments.customer_satisfaction === 'medium' ? 'secondary' : 'destructive'
                        }>
                          {scoreData.sentiments.customer_satisfaction || 'Unknown'}
                        </Badge>
                      </div>

                      {scoreData.sentiments.sentiment_progression && scoreData.sentiments.sentiment_progression.length > 0 && (
                        <div>
                          <div className="text-sm font-medium mb-2">Sentiment Progression</div>
                          <div className="flex flex-wrap gap-2">
                            {scoreData.sentiments.sentiment_progression.map((sentiment, index) => (
                              <div key={index} className="flex items-center space-x-1">
                                <span className="text-xs text-muted-foreground">{index + 1}.</span>
                                <Badge variant="outline" className="text-xs">
                                  {sentiment}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Flags & Issues */}
                <Card className="shadow-card">
                  <CardHeader>
                    <CardTitle className="flex items-center">
                      <Flag className="mr-2 h-5 w-5" />
                      Review Flags
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {Object.entries(scoreData.flags).map(([key, flagged]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-sm">{formatScoreName(key)}</span>
                        <Badge variant={flagged ? "destructive" : "outline"}>
                          {flagged ? "Flagged" : "Clear"}
                        </Badge>
                      </div>
                    ))}

                    <Separator className="my-4" />

                    <div className="space-y-2">
                      <div className="text-sm font-medium">Scoring Metadata</div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Rubric Version: {scoreData.rubric_version}</div>
                        <div>Source: <Badge variant="outline" className="text-xs">{scoreData.rubric_source || 'organization'}</Badge></div>
                        <div>Scored: {new Date(scoreData.created_at).toLocaleString()}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {scoreLoading && (
          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="flex items-center justify-center space-x-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Loading scoring results...</span>
              </div>
            </CardContent>
          </Card>
        )}

        {!scoreData && !scoreLoading && conversation.scored && (
          <Card className="shadow-card">
            <CardContent className="p-6">
              <div className="text-center text-muted-foreground">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>No scoring data available for this conversation</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
          {/* Transcript */}
          <div className="lg:col-span-2">
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="flex flex-col space-y-2 sm:flex-row sm:items-center sm:space-y-0">
                  <div className="flex items-center">
                    <Bot className="mr-2 h-5 w-5" />
                    Conversation Transcript
                  </div>
                  <Badge variant="outline" className="w-fit">
                    {messages.length} messages
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] sm:h-[500px] lg:h-[600px] p-4">
                  <div className="space-y-4">
                    {messages.map((message, index) => (
                      <div key={index} className="flex space-x-3">
                        <div className="flex-shrink-0 mt-1">
                          {getMessageIcon(message.role)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-col space-y-1 sm:flex-row sm:items-center sm:space-y-0 sm:space-x-2 mb-1">
                            <span className="text-sm font-medium capitalize">
                              {message.speaker}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(message.timestamp)}
                            </span>
                          </div>
                          <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3">
                            {message.message}
                          </div>
                        </div>
                      </div>
                    ))}
                    {messages.length === 0 && (
                      <div className="text-center py-8 text-muted-foreground">
                        No messages found in transcript
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* AI Summary */}
            {conversation.final_ai_summary && (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg">AI Summary</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-foreground leading-relaxed">
                    {conversation.final_ai_summary}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Cost Breakdown */}
            {user?.role === "super_admin" && costBreakdown && (
              <Card className="shadow-card">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center">
                    <DollarSign className="mr-2 h-5 w-5" />
                    Cost Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    {costBreakdown?.model !== undefined && costBreakdown.model > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Model (LLM)</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.model)}</span>
                      </div>
                    )}
                    {costBreakdown?.session !== undefined && costBreakdown.session > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Session</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.session)}</span>
                      </div>
                    )}
                    {costBreakdown?.analysis !== undefined && costBreakdown.analysis > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Analysis</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.analysis)}</span>
                      </div>
                    )}
                    {costBreakdown?.llm !== undefined && costBreakdown.llm > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">LLM</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.llm)}</span>
                      </div>
                    )}
                    {costBreakdown?.stt !== undefined && costBreakdown.stt > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Speech-to-Text</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.stt)}</span>
                      </div>
                    )}
                    {costBreakdown?.tts !== undefined && costBreakdown.tts > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Text-to-Speech</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.tts)}</span>
                      </div>
                    )}
                    {costBreakdown?.vapi !== undefined && costBreakdown.vapi > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Vapi Platform</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.vapi)}</span>
                      </div>
                    )}
                    {costBreakdown?.whisper_transcription && costBreakdown.whisper_transcription > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Whisper Transcription</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown.whisper_transcription)}</span>
                      </div>
                    )}
                    {costBreakdown?.gpt_scoring && costBreakdown.gpt_scoring.total > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">GPT Scoring</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown.gpt_scoring.total)}</span>
                      </div>
                    )}
                    {costBreakdown?.transport && costBreakdown.transport > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Transport</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown.transport)}</span>
                      </div>
                    )}
                    {costBreakdown?.knowledgeBaseCost && costBreakdown.knowledgeBaseCost > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Knowledge Base</span>
                        <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown.knowledgeBaseCost)}</span>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="flex justify-between font-medium">
                    <span>Total</span>
                    <span className="font-mono">{formatCurrency(conversation.total_cost || calculateActualTotal(costBreakdown))}</span>
                  </div>

                  {/* Token Usage */}
                  <Separator />
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Usage Metrics</h4>
                    <div className="flex justify-between items-center text-sm">
                      <span className="truncate">Prompt Tokens</span>
                      <span className="font-mono flex-shrink-0">{(costBreakdown?.llmPromptTokens || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="truncate">Completion Tokens</span>
                      <span className="font-mono flex-shrink-0">{(costBreakdown?.llmCompletionTokens || 0).toLocaleString()}</span>
                    </div>
                    {costBreakdown?.gpt_scoring && (
                      <>
                        <div className="flex justify-between items-center text-sm">
                          <span className="truncate">GPT Scoring Prompt Tokens</span>
                          <span className="font-mono flex-shrink-0">{(costBreakdown.gpt_scoring.llmPromptTokens || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="truncate">GPT Scoring Completion Tokens</span>
                          <span className="font-mono flex-shrink-0">{(costBreakdown.gpt_scoring.llmCompletionTokens || 0).toLocaleString()}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between items-center text-sm">
                      <span className="truncate">TTS Characters</span>
                      <span className="font-mono flex-shrink-0">{(costBreakdown?.ttsCharacters || 0).toLocaleString()}</span>
                    </div>
                    {costBreakdown?.whisper_duration_minutes && costBreakdown.whisper_duration_minutes > 0 && (
                      <div className="flex justify-between items-center text-sm">
                        <span className="truncate">Whisper Audio Duration</span>
                        <span className="font-mono flex-shrink-0">{costBreakdown.whisper_duration_minutes.toFixed(2)}m</span>
                      </div>
                    )}
                  </div>

                  {/* Analysis Breakdown */}
                  {costBreakdown.analysisCostBreakdown && (
                    <>
                      <Separator />
                      <div className="space-y-2">
                        <h4 className="text-sm font-medium">Analysis Costs</h4>
                        <div className="flex justify-between items-center text-sm">
                          <span className="truncate">Summary</span>
                          <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.analysisCostBreakdown?.summary)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="truncate">Success Evaluation</span>
                          <span className="font-mono flex-shrink-0">{formatCurrency(costBreakdown?.analysisCostBreakdown?.successEvaluation)}</span>
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Metadata */}
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-lg">Metadata</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Organization:</span>
                    <div className="font-medium truncate">{conversation.organizations?.name || "Unknown"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Assistant:</span>
                    <div className="font-medium truncate">{conversation.assistants?.friendly_name || "Unknown"}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Scored:</span>
                    <div className="mt-1">
                      <Badge variant={conversation.scored ? "default" : "secondary"}>
                        {conversation.scored ? "Yes" : "No"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Source:</span>
                    <div className="mt-1">
                      <Badge variant="outline" className="capitalize">
                        {conversation.transcript_source}
                      </Badge>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="text-xs text-muted-foreground space-y-1">
                  <div>Created: {new Date(conversation.created_at).toLocaleString()}</div>
                  <div>Updated: {new Date(conversation.updated_at).toLocaleString()}</div>
                  <div>ID: {conversation.id}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );


}