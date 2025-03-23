import type { ControllerProps, FieldPath, FieldValues } from "react-hook-form";

import { z } from "zod";

// Form-related types
export type FormFieldContextValue<
  TFieldValues extends FieldValues = FieldValues,
  TName extends FieldPath<TFieldValues> = FieldPath<TFieldValues>,
> = {
  name: TName;
};

export type FormItemContextValue = {
  id: string;
};

// message type for conversation
export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: number;
}

// popup component types
export interface PopupSettings {
  geminiApiKey: string;
  cohereApiKey: string;
  preferences: string;
}

export interface PopupProps {
  initialSettings?: Partial<PopupSettings>;
  onSave?: (settings: PopupSettings) => void;
  className?: string;
}

// form schema types
export const searchSchema = z.object({
  query: z.string().min(1, "Please enter a search term"),
});

export type SearchFormValues = z.infer<typeof searchSchema>;

export const contactSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Please enter a valid email address"),
  message: z.string().min(10, "Message must be at least 10 characters"),
});

export type ContactFormValues = z.infer<typeof contactSchema>;

export const loginSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

// graph data model
export interface Position {
  x: number;
  y: number;
}

export type Edge = WebsiteToKeywordEdge | WebsiteToMentionEdge;

export interface WebsiteNode {
  id: string;
  url: string;
  title: string;
  favicon?: string;
  visitedAt: number;
  lastPosition?: Position;
}

export interface KeywordNode {
  id: string;
  text: string;
  sourceWebsiteId?: string;
  position?: Position;
}

export interface MentionNode {
  id: string;
  text: string;
  sourceWebsiteId: string;
  context: string;
  position?: Position;
}

export interface WebsiteToKeywordEdge {
  id: string;
  source: string; // WebsiteNode id
  target: string; // KeywordNode id
}

export interface WebsiteToMentionEdge {
  id: string;
  source: string; // WebsiteNode id
  target: string; // MentionNode id
}

export interface GraphData {
  websites: WebsiteNode[];
  keywords: KeywordNode[];
  mentions: MentionNode[];
  websiteToKeywordEdges: WebsiteToKeywordEdge[];
  websiteToMentionEdges: WebsiteToMentionEdge[];
}

export interface SearchResults {
  websites: WebsiteNode[];
  keywords: KeywordNode[];
  mentions: MentionNode[];
}
