import { ExternalLink, Maximize2, Minimize2, Send } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { AlertCircle } from "lucide-react";
import { Button } from "~components/ui/button";
import { Card } from "~components/ui/card";
import type { Message } from "~/types";
import PageClassifier from "~/agents/PageClassifier";
import ReactMarkdown from "react-markdown";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import { cn } from "~/lib/utils";
import remarkGfm from "remark-gfm";

// Add a new interface for source citations
interface SourceCitation {
  title: string;
  url: string;
}

// Extend the Message interface to include sources
interface MessageWithSources extends Message {
  sources?: SourceCitation[];
  isStreaming?: boolean;
}

export default function ConversationPanel() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<MessageWithSources[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [geminiApiKey, setGeminiApiKey] = useState<string>("");
  const [cohereApiKey, setCohereApiKey] = useState<string>("");
  const [userPreferences, setUserPreferences] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [streamController, setStreamController] =
    useState<AbortController | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const classifierRef = useRef<PageClassifier | null>(null);

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      // first load
      chrome.storage.local.get(
        ["geminiApiKey", "cohereApiKey", "preferences"],
        (result) => {
          setGeminiApiKey(result.geminiApiKey || "");
          setCohereApiKey(result.cohereApiKey || "");
          setUserPreferences(result.preferences || "");

          // Initialize classifier if we have a Cohere API key
          if (result.cohereApiKey) {
            classifierRef.current = new PageClassifier({
              cohereApiKey: result.cohereApiKey,
              userPreferences: result.preferences || "",
            });
          }
        }
      );

      // check for changes
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local") {
          if (changes.geminiApiKey) {
            setGeminiApiKey(changes.geminiApiKey.newValue || "");
          }
          if (changes.cohereApiKey) {
            setCohereApiKey(changes.cohereApiKey.newValue || "");

            // Update classifier when API key changes
            if (changes.cohereApiKey.newValue) {
              classifierRef.current = new PageClassifier({
                cohereApiKey: changes.cohereApiKey.newValue,
                userPreferences: userPreferences,
              });
            } else {
              classifierRef.current = null;
            }
          }
          if (changes.preferences) {
            setUserPreferences(changes.preferences.newValue || "");

            // Update classifier when preferences change
            if (classifierRef.current && cohereApiKey) {
              classifierRef.current = new PageClassifier({
                cohereApiKey: cohereApiKey,
                userPreferences: changes.preferences.newValue || "",
              });
            }
          }
        }
      });
    }
  }, [cohereApiKey, userPreferences]);

  // scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // cleanup for stream controller
  useEffect(() => {
    return () => {
      if (streamController) {
        streamController.abort();
      }
    };
  }, [streamController]);

  const streamGeminiResponse = async (prompt: string) => {
    try {
      // abort controller for stream
      const controller = new AbortController();
      setStreamController(controller);

      //  Gemini with streaming
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent";

      // duct tape
      // add instructions to avoid markdown links and images
      const safePrompt = `${prompt}\n\nIMPORTANT: In your response, do NOT use markdown links like [text](url) or images like ![alt](url). Instead, format links as plain text like "URL: example.com" or just paste the URL directly. This is to prevent rendering issues as it crashes the browser.`;

      const response = await fetch(`${url}?key=${geminiApiKey}&alt=sse`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: safePrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
        signal: controller.signal,
      });

      // ok?
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || "Error contacting Gemini API"
        );
      }

      // create new message
      const messageId = Date.now().toString();
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          content: "",
          role: "assistant",
          timestamp: Date.now(),
          isStreaming: true,
        },
      ]);

      // parse sse
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error("Could not get response reader");
      }

      let completeResponse = "";
      let usedSources: SourceCitation[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n").filter((line) => line.trim() !== "");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(5);

            // skip "[DONE]" message
            if (data === "[DONE]") continue;

            try {
              const parsedData = JSON.parse(data);

              if (
                parsedData.candidates &&
                parsedData.candidates.length > 0 &&
                parsedData.candidates[0].content &&
                parsedData.candidates[0].content.parts &&
                parsedData.candidates[0].content.parts.length > 0
              ) {
                const textChunk =
                  parsedData.candidates[0].content.parts[0].text || "";

                if (textChunk) {
                  completeResponse += textChunk;

                  // update message content
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === messageId
                        ? { ...msg, content: completeResponse }
                        : msg
                    )
                  );
                }
              }
            } catch (e) {
              console.error("Error parsing SSE chunk:", e);
            }
          }
        }
      }

      // once streaming is complete
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? {
                ...msg,
                content: completeResponse,
                isStreaming: false,
                sources: usedSources.length > 0 ? usedSources : undefined,
              }
            : msg
        )
      );

      return completeResponse;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.log("Fetch aborted");
        return "";
      }

      console.error("Error with Gemini API:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      return "I encountered an error processing your request. Please check your Gemini API key and try again.";
    } finally {
      setStreamController(null);
    }
  };

  const fetchGeminiResponse = async (prompt: string) => {
    try {
      // API endpoint for Gemini
      const url =
        "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

      // duct tape
      // add instructions to avoid markdown links and images
      const safePrompt = `${prompt}\n\nIMPORTANT: In your response, do NOT use markdown links like [text](url) or images like ![alt](url). Instead, format links as plain text like "URL: example.com" or just paste the URL directly. This is to prevent rendering issues.`;

      // Gemini API request
      const response = await fetch(`${url}?key=${geminiApiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: safePrompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 1024,
          },
        }),
      });

      // ok?
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message || "Error contacting Gemini API"
        );
      }

      // parse response
      const data = await response.json();
      if (!data.candidates || data.candidates.length === 0) {
        throw new Error("No response generated");
      }

      // extract text
      const generatedText = data.candidates[0].content.parts[0].text;
      return generatedText;
    } catch (error) {
      console.error("Error with Gemini API:", error);
      setError(
        error instanceof Error ? error.message : "Unknown error occurred"
      );
      return "I encountered an error processing your request. Please check your Gemini API key and try again.";
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim()) return;

    if (!geminiApiKey) {
      setError("Please set your Gemini API key in the extension popup.");
      return;
    }

    setError(null);

    // add to messages
    const userMessage: MessageWithSources = {
      id: Date.now().toString(),
      content: message,
      role: "user",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const userQuery = message;
    setMessage("");
    setIsLoading(true);

    try {
      // get browsing context data
      const storageData = await new Promise<any>((resolve) => {
        chrome.storage.local.get(["graphData"], resolve);
      });

      // prepare context
      let contextPrompt = userQuery;
      let rankedData = {
        websites: [],
        keywords: [],
        mentions: [],
      };
      let usedSources: SourceCitation[] = [];

      if (storageData.graphData) {
        const websites = storageData.graphData.websites || [];
        const keywords = storageData.graphData.keywords || [];
        const mentions = storageData.graphData.mentions || [];

        // use PageClassifier to semantically rank the browsing data
        if (classifierRef.current) {
          rankedData = await classifierRef.current.semanticSearch(
            userQuery,
            websites.slice(0, 15),
            keywords.slice(0, 25),
            mentions.slice(0, 15)
          );
        } else {
          rankedData = {
            websites: websites.slice(0, 5),
            keywords: keywords.slice(0, 10),
            mentions: mentions.slice(0, 5),
          };
        }

        // store the sources used for citation
        usedSources = rankedData.websites.slice(0, 5).map((site) => ({
          title: site.title,
          url: site.url,
        }));

        // format context with ranked browsing data
        if (rankedData.websites.length > 0) {
          contextPrompt = `I have been browsing these websites recently:\n${rankedData.websites
            .slice(0, 5)
            .map((site: any) => `- ${site.title} (${site.url})`)
            .join(
              "\n"
            )}\n\nWith these keywords identified:\n${rankedData.keywords
            .slice(0, 10)
            .map((kw: any) => `- ${kw.text}`)
            .join("\n")}`;

          // add mentions if available
          if (rankedData.mentions.length > 0) {
            contextPrompt += `\n\nImportant mentions from these pages include:\n${rankedData.mentions
              .slice(0, 3)
              .map(
                (m: any) =>
                  `- ${m.text}: "${m.context.substring(0, 100)}${m.context.length > 100 ? "..." : ""}"`
              )
              .join("\n")}`;
          }

          contextPrompt += `\n\nBased on this context, please answer: ${userQuery}`;
        }
      }

      // stream AI response from Gemini API
      await streamGeminiResponse(contextPrompt);
    } catch (error) {
      console.error("Error in chat:", error);
      // error message
      const errorMessage: MessageWithSources = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, there was an error processing your request.",
        role: "assistant",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = () => {
    if (!message.trim()) return;
    handleSendMessage();
  };

  return (
    <Card className="flex flex-col justify-between overflow-hidden fixed bottom-0 right-0 z-50 w-[400px] shadow-lg rounded-none rounded-tl-lg">
      <div className="flex items-center justify-between p-2 border-b bg-muted/30">
        <div className="flex items-center">
          <span className="text-xs font-medium">Chat</span>
        </div>
        <button
          onClick={() => setIsMinimized(!isMinimized)}
          className="h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center"
        >
          {isMinimized ? (
            <Maximize2 className="h-3 w-3" />
          ) : (
            <Minimize2 className="h-3 w-3" />
          )}
        </button>
      </div>

      {!isMinimized && (
        <>
          <ScrollArea
            className="flex-1 w-full max-h-[60vh] overflow-y-auto"
            ref={scrollAreaRef}
          >
            <div className="space-y-4 p-4">
              {messages.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-8">
                  {!geminiApiKey ? (
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                      <p className="text-yellow-500">
                        Gemini API key not configured. Please set your API key
                        in the extension popup.
                      </p>
                    </div>
                  ) : (
                    <p>Ask me anything about your browsing history!</p>
                  )}
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "p-4 rounded-lg w-full",
                      msg.role === "user" ? "bg-muted" : "bg-transparent"
                    )}
                  >
                    <div className="text-sm text-foreground prose prose-sm w-full break-words">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                      {msg.isStreaming && (
                        <span className="inline-block w-2 h-4 ml-1 bg-primary animate-pulse rounded-sm" />
                      )}
                    </div>

                    {/* Source Citations */}
                    {msg.role === "assistant" &&
                      !msg.isStreaming &&
                      msg.sources &&
                      msg.sources.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-muted">
                          <p className="text-xs text-muted-foreground mb-1">
                            Sources:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {msg.sources.map((source, idx) => (
                              <a
                                key={idx}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center text-xs px-2 py-1 bg-primary/10 text-primary rounded-full hover:bg-primary/20 transition-colors"
                              >
                                <span className="truncate max-w-[120px]">
                                  {source.title}
                                </span>
                                <ExternalLink className="ml-1 h-3 w-3" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                ))
              )}
              {error && (
                <div className="p-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  {error}
                </div>
              )}
              {isLoading && !messages.some((msg) => msg.isStreaming) && (
                <div className="p-4 text-sm text-muted-foreground animate-pulse">
                  Searching...
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <div className="border-t p-4 flex flex-row justify-between items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={
                geminiApiKey
                  ? "Ask about your browsing history..."
                  : "Gemini API key required to chat"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.shiftKey &&
                  !isLoading &&
                  geminiApiKey
                ) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSend();
                }
              }}
              className={cn(
                "flex-1 min-h-[40px] max-h-[200px] overflow-y-auto resize-none",
                !geminiApiKey &&
                  "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
              )}
              rows={1}
              disabled={isLoading || !geminiApiKey}
            />
            <Button
              onClick={handleSend}
              size="icon"
              disabled={isLoading || !message.trim() || !geminiApiKey}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
