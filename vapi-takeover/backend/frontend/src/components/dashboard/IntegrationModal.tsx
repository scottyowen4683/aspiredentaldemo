import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Copy,
  Code,
  Terminal,
  Globe,
  Phone,
  CheckCircle,
  ExternalLink,
  MessageSquare,
  Braces,
} from "lucide-react";

interface IntegrationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assistantId: string;
  assistantName: string;
  assistantType: "voice" | "chat" | "both";
  pilotEnabled?: boolean;
  pilotSlug?: string | null;
}

interface EmbedCodeData {
  success: boolean;
  assistant: {
    id: string;
    name: string;
    type: string;
    organization: string;
  };
  embedCodes: {
    chat?: {
      script: string;
      iframe: string;
      npm: string;
      react: string;
      api: {
        endpoint: string;
        method: string;
        headers: Record<string, string>;
        body: Record<string, string>;
        example: string;
      };
    };
    voice?: {
      phoneNumber: string;
      twilioWebhook: string;
      outboundApi: {
        endpoint: string;
        method: string;
        body: Record<string, string>;
        example: string;
      };
      instructions: string;
    };
  };
  widgetConfig: {
    primaryColor: string;
    greeting: string;
    title: string;
    position: string;
    showPoweredBy: boolean;
  };
}

export default function IntegrationModal({
  open,
  onOpenChange,
  assistantId,
  assistantName,
  assistantType,
  pilotEnabled,
  pilotSlug,
}: IntegrationModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [embedData, setEmbedData] = useState<EmbedCodeData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (open && assistantId) {
      fetchEmbedCode();
    }
  }, [open, assistantId]);

  const fetchEmbedCode = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/assistants/${assistantId}/embed-code`);
      const data = await response.json();

      if (data.success) {
        setEmbedData(data);
      } else {
        throw new Error(data.error || "Failed to fetch embed code");
      }
    } catch (error) {
      console.error("Error fetching embed code:", error);
      toast({
        title: "Error",
        description: "Failed to load integration code",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldName);
      toast({
        title: "Copied!",
        description: `${fieldName} copied to clipboard`,
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const CodeBlock = ({
    code,
    language,
    fieldName,
  }: {
    code: string;
    language: string;
    fieldName: string;
  }) => (
    <div className="relative group">
      <pre className="bg-slate-950 text-slate-50 p-4 rounded-lg overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="secondary"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={() => copyToClipboard(code, fieldName)}
      >
        {copiedField === fieldName ? (
          <CheckCircle className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4" />
        )}
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code className="h-5 w-5" />
            Integration Code - {assistantName}
          </DialogTitle>
          <DialogDescription>
            Copy the code snippets below to integrate this assistant into your website or application.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-4 py-4">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : embedData ? (
          <Tabs defaultValue={pilotEnabled && pilotSlug ? "pilot" : (assistantType === "voice" ? "voice" : "chat")} className="mt-4">
            <TabsList className={`grid w-full ${pilotEnabled && pilotSlug ? 'grid-cols-3' : 'grid-cols-2'}`}>
              {pilotEnabled && pilotSlug && (
                <TabsTrigger value="pilot" className="flex items-center gap-2">
                  <Globe className="h-4 w-4" />
                  Pilot Page
                </TabsTrigger>
              )}
              {(assistantType === "chat" || assistantType === "both") && (
                <TabsTrigger value="chat" className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Chat Widget
                </TabsTrigger>
              )}
              {(assistantType === "voice" || assistantType === "both") && (
                <TabsTrigger value="voice" className="flex items-center gap-2">
                  <Phone className="h-4 w-4" />
                  Voice Integration
                </TabsTrigger>
              )}
            </TabsList>

            {/* Pilot Page Integration */}
            {pilotEnabled && pilotSlug && (
              <TabsContent value="pilot" className="space-y-6 mt-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Pilot Demo Page
                    </CardTitle>
                    <CardDescription>
                      A standalone demo page for this chatbot with your client's branding.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Direct URL */}
                    <div>
                      <p className="text-sm font-medium mb-2">Direct URL</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm bg-slate-950 text-slate-50 px-4 py-3 rounded-lg">
                          {window.location.origin}/pilot/{pilotSlug}
                        </code>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => copyToClipboard(`${window.location.origin}/pilot/${pilotSlug}`, "Pilot URL")}
                        >
                          {copiedField === "Pilot URL" ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(`/pilot/${pilotSlug}`, '_blank')}
                        >
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* QR Code placeholder */}
                    <div className="p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        <strong>Perfect for:</strong> Pilot deployments, stakeholder demos, and evaluation periods.
                        Share this URL with reviewers to test the AI assistant.
                      </p>
                    </div>

                    {/* Iframe Embed */}
                    <div>
                      <p className="text-sm font-medium mb-2">Embed as iframe</p>
                      <CodeBlock
                        code={`<iframe
  src="${window.location.origin}/pilot/${pilotSlug}"
  width="100%"
  height="800"
  frameborder="0"
  allow="microphone"
></iframe>`}
                        language="html"
                        fieldName="Pilot Iframe"
                      />
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Chat Integration */}
            {embedData.embedCodes.chat && (
              <TabsContent value="chat" className="space-y-6 mt-4">
                {/* Quick Start */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Quick Start - Script Tag
                    </CardTitle>
                    <CardDescription>
                      Add this single line to your website's HTML, just before the closing &lt;/body&gt; tag.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock
                      code={embedData.embedCodes.chat.script}
                      language="html"
                      fieldName="Script Tag"
                    />
                    <div className="mt-4 p-4 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-900">
                      <p className="text-sm text-green-800 dark:text-green-200">
                        <strong>That's it!</strong> The chat widget will automatically appear in the bottom-right corner of your website.
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* React Integration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Braces className="h-4 w-4" />
                      React / Next.js Component
                    </CardTitle>
                    <CardDescription>
                      For React applications, use this component.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock
                      code={embedData.embedCodes.chat.react}
                      language="tsx"
                      fieldName="React Component"
                    />
                  </CardContent>
                </Card>

                {/* API Integration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Direct API Access
                    </CardTitle>
                    <CardDescription>
                      For custom integrations, use the chat API directly.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Endpoint</p>
                        <code className="text-xs bg-muted px-2 py-1 rounded">
                          {embedData.embedCodes.chat.api.endpoint}
                        </code>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Method</p>
                        <Badge variant="secondary">{embedData.embedCodes.chat.api.method}</Badge>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-2">cURL Example</p>
                      <CodeBlock
                        code={embedData.embedCodes.chat.api.example}
                        language="bash"
                        fieldName="cURL Example"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Widget Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Widget Customization</CardTitle>
                    <CardDescription>
                      Configure the widget appearance with these data attributes.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3 bg-muted rounded-lg">
                        <code className="text-xs">data-primary-color</code>
                        <p className="text-muted-foreground mt-1">Widget accent color</p>
                        <div className="flex items-center gap-2 mt-2">
                          <div
                            className="w-6 h-6 rounded"
                            style={{ backgroundColor: embedData.widgetConfig.primaryColor }}
                          />
                          <code className="text-xs">{embedData.widgetConfig.primaryColor}</code>
                        </div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <code className="text-xs">data-position</code>
                        <p className="text-muted-foreground mt-1">Widget position</p>
                        <Badge variant="outline" className="mt-2">
                          {embedData.widgetConfig.position}
                        </Badge>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <code className="text-xs">data-greeting</code>
                        <p className="text-muted-foreground mt-1">Initial message</p>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <code className="text-xs">data-auto-open</code>
                        <p className="text-muted-foreground mt-1">Auto-open widget</p>
                        <Badge variant="outline" className="mt-2">true / false</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}

            {/* Voice Integration */}
            {embedData.embedCodes.voice && (
              <TabsContent value="voice" className="space-y-6 mt-4">
                {/* Phone Number */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Phone Number
                    </CardTitle>
                    <CardDescription>
                      Callers can reach this assistant at the following number.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                      <span className="text-2xl font-mono font-bold">
                        {embedData.embedCodes.voice.phoneNumber || "Not configured"}
                      </span>
                      {embedData.embedCodes.voice.phoneNumber && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              embedData.embedCodes.voice!.phoneNumber,
                              "Phone Number"
                            )
                          }
                        >
                          {copiedField === "Phone Number" ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Twilio Webhook Setup */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Twilio Webhook Configuration</CardTitle>
                    <CardDescription>
                      Configure your Twilio phone number to use these webhook URLs.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="p-4 bg-muted rounded-lg">
                      <p className="text-sm font-medium mb-2">Voice Webhook URL</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-slate-950 text-slate-50 px-3 py-2 rounded">
                          {embedData.embedCodes.voice.twilioWebhook}
                        </code>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(
                              embedData.embedCodes.voice!.twilioWebhook,
                              "Webhook URL"
                            )
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900">
                      <h4 className="font-medium text-blue-800 dark:text-blue-200 mb-2">
                        Setup Instructions
                      </h4>
                      <pre className="text-xs text-blue-700 dark:text-blue-300 whitespace-pre-wrap">
                        {embedData.embedCodes.voice.instructions}
                      </pre>
                    </div>
                  </CardContent>
                </Card>

                {/* Outbound API */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Terminal className="h-4 w-4" />
                      Outbound Call API
                    </CardTitle>
                    <CardDescription>
                      Initiate outbound calls programmatically.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <CodeBlock
                      code={embedData.embedCodes.voice.outboundApi.example}
                      language="bash"
                      fieldName="Outbound API"
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        ) : (
          <div className="py-8 text-center text-muted-foreground">
            <p>No integration data available</p>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button onClick={fetchEmbedCode}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Refresh Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
