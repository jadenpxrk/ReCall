import { Maximize2, Minimize2, Send } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import { AlertCircle } from "lucide-react";
import { Button } from "~components/ui/button";
import { Card } from "~components/ui/card";
import type { Message } from "~/types";
import { ScrollArea } from "./ui/scroll-area";
import { Textarea } from "./ui/textarea";
import { cn } from "~/lib/utils";

export default function ConversationPanel() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState<string>("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      // first load
      chrome.storage.local.get(["apiKey"], (result) => {
        setApiKey(result.apiKey || "");
      });

      // check for changes
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === "local" && changes.apiKey) {
          setApiKey(changes.apiKey.newValue || "");
        }
      });
    }
  }, []);

  const handleSendMessage = async () => {
    if (!message.trim() || !apiKey) return;

    // add to messages
    const userMessage: Message = {
      id: Date.now().toString(),
      content: message,
      role: "user",
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setMessage("");
    setIsLoading(true);

    // simulate response for now
    setTimeout(() => {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content:
          "This is a frontend-only implementation. In a real application, I would provide a helpful response based on your query.",
        role: "assistant",
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const handleSend = () => {
    if (!message.trim() || !apiKey) return;
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
                  {!apiKey && (
                    <div className="flex flex-col items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                      <p className="text-yellow-500">
                        API key not configured. Please set your API key in
                        settings.
                      </p>
                    </div>
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
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="p-4 text-sm text-muted-foreground animate-pulse">
                  Searching...
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="border-t p-4 flex flex-row justify-between items-end gap-2">
            <Textarea
              ref={textareaRef}
              placeholder={
                apiKey
                  ? "Type a message..."
                  : "API key required to send messages"
              }
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !isLoading && apiKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSend();
                }
              }}
              className={cn(
                "flex-1 min-h-[40px] max-h-[200px] overflow-y-auto resize-none",
                !apiKey &&
                  "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800"
              )}
              rows={1}
              disabled={isLoading || !apiKey}
            />
            <Button
              onClick={handleSend}
              size="icon"
              disabled={isLoading || !message.trim() || !apiKey}
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
