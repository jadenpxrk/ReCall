import React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { Button } from "../ui/button";
import ConversationPanel from "../ConversationPanel";
import { Input } from "../ui/input";
import { Search } from "lucide-react";
import ThemeToggle from "../ThemeToggle";
import { Form, FormControl, FormField, FormItem } from "../ui/form";
import { searchSchema, type SearchFormValues } from "~/utils/form-schemas";

interface NewTabProps {
  className?: string;
  onSearch?: (query: string) => void;
}

export default function NewTabComponent({
  className = "min-h-screen bg-background text-foreground flex flex-col",
  onSearch,
}: NewTabProps) {
  const form = useForm<SearchFormValues>({
    resolver: zodResolver(searchSchema),
    defaultValues: {
      query: "",
    },
  });

  const handleSubmit = form.handleSubmit((data) => {
    if (onSearch) {
      onSearch(data.query);
    } else {
      window.location.href = `https://www.google.com/search?q=${encodeURIComponent(data.query)}`;
    }
  });

  return (
    <div className={className}>
      <header className="p-4 flex justify-end">
        <ThemeToggle />
      </header>
      <main className="flex-1 flex flex-col items-center justify-center">
        <div className="w-full max-w-2xl px-4">
          <h1 className="text-3xl font-bold text-center mb-8">ReCall</h1>
          <Form {...form}>
            <form onSubmit={handleSubmit} className="relative mb-12">
              <FormField
                control={form.control}
                name="query"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <div className="relative">
                        <Input
                          placeholder="Search the web..."
                          className="h-12 pl-4 pr-12"
                          {...field}
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
          <div className="border border-border rounded-lg p-8 text-center bg-card">
            <p className="text-lg text-muted-foreground">graph placeholder</p>
          </div>
        </div>
      </main>
      <ConversationPanel />
    </div>
  );
}
