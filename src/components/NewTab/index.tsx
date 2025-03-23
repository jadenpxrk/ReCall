import React, { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../ui/button";
import ConversationPanel from "../ConversationPanel";
import { Input } from "../ui/input";
import { Search } from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import { Form, FormControl, FormField, FormItem } from "../ui/form";
import Graph from "../Graph";
import { searchSchema, type SearchFormValues } from "~/utils/form-schemas";
import PageClassifier from "~/agents/PageClassifier";

interface NewTabProps {
  className?: string;
  onSearch?: (query: string) => void;
}

interface SearchResult {
  type: "website" | "keyword" | "mention";
  text: string;
  url?: string;
  context?: string;
}

export default function NewTabComponent({
  className = "min-h-screen bg-background text-foreground flex flex-col",
  onSearch,
}: NewTabProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [cohereApiKey, setCohereApiKey] = useState<string>("");
  const [userPreferences, setUserPreferences] = useState<string>("");
  const classifierRef = useRef<PageClassifier | null>(null);

  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      query: "",
    },
  });

  // keys
  useEffect(() => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(
        ["cohereApiKey", "preferences", "graphData"],
        (result) => {
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
    }
  }, []);

  const performSearch = async (query: string) => {
    if (!query.trim() || !classifierRef.current) return;

    setIsLoading(true);

    try {
      // browsing data
      const storageData = await new Promise<any>((resolve) => {
        chrome.storage.local.get(["graphData"], resolve);
      });

      if (!storageData.graphData) {
        setSearchResults([]);
        return;
      }

      const websites = storageData.graphData.websites || [];
      const keywords = storageData.graphData.keywords || [];
      const mentions = storageData.graphData.mentions || [];

      // page classification
      const rankedData = await classifierRef.current.rankBrowsingData(
        query,
        websites.slice(0, 20),
        keywords.slice(0, 30),
        mentions.slice(0, 20),
        10 // max results
      );

      // convert to unified format for display
      const results: SearchResult[] = [
        ...rankedData.websites.map((site) => ({
          type: "website" as const,
          text: site.title,
          url: site.url,
        })),
        ...rankedData.keywords.map((kw) => ({
          type: "keyword" as const,
          text: kw.text,
        })),
        ...rankedData.mentions.map((mention) => ({
          type: "mention" as const,
          text: mention.text,
          context: mention.context,
        })),
      ];

      setSearchResults(results);
    } catch (error) {
      console.error("Search error:", error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = form.handleSubmit((data) => {
    setSearchTerm(data.query);
    // cohere rerank
    performSearch(data.query);

    // if onSearch prop is provided
    if (onSearch) {
      onSearch(data.query);
    }
  });

  return (
    <div className={className}>
      <div className="fixed inset-0 z-10">
        <Graph />
      </div>

      <div className="relative w-full h-full z-20 pointer-events-none">
        <header className="p-4 flex justify-end">
          <div className="pointer-events-auto">
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full max-w-2xl px-4">
            <h1 className="text-3xl font-bold text-center mb-8">ReCall</h1>
            <Form {...form}>
              <form onSubmit={handleSubmit} className="relative mb-4">
                <FormField
                  control={form.control}
                  name="query"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <div className="relative pointer-events-auto">
                          <Input
                            placeholder="Search your browsing history..."
                            className="h-12 pl-4 pr-12 bg-background/80 backdrop-blur-sm"
                            {...field}
                            onChange={(e) => {
                              field.onChange(e);
                              if (e.target.value.length > 2) {
                                performSearch(e.target.value);
                              } else if (e.target.value.length === 0) {
                                setSearchResults([]);
                              }
                            }}
                          />
                          <Button
                            type="submit"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10"
                          >
                            <Search className="h-5 w-5" />
                            <span className="sr-only">Search</span>
                          </Button>
                        </div>
                      </FormControl>
                    </FormItem>
                  )}
                />
              </form>
            </Form>

            {(searchResults.length > 0 || isLoading) && (
              <div className="pointer-events-auto bg-background/90 backdrop-blur-sm rounded-lg shadow-lg p-3 mb-12 max-h-[50vh] overflow-y-auto">
                {isLoading ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Searching...
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h2 className="text-sm font-medium mb-2">Results</h2>
                    {searchResults.map((result, idx) => (
                      <div
                        key={idx}
                        className="p-2 hover:bg-muted rounded-md transition-colors"
                      >
                        {result.type === "website" && (
                          <a
                            href={result.url}
                            className="block"
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <div className="font-medium text-primary">
                              {result.text}
                            </div>
                            <div className="text-xs text-muted-foreground truncate">
                              {result.url}
                            </div>
                          </a>
                        )}
                        {result.type === "keyword" && (
                          <div>
                            <div className="font-medium flex items-center gap-1">
                              <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-xs">
                                Keyword
                              </span>
                              {result.text}
                            </div>
                          </div>
                        )}
                        {result.type === "mention" && (
                          <div>
                            <div className="font-medium flex items-center gap-1">
                              <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded text-xs">
                                Mention
                              </span>
                              {result.text}
                            </div>
                            {result.context && (
                              <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                {result.context}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <div className="pointer-events-auto">
          <ConversationPanel />
        </div>
      </div>
    </div>
  );
}
