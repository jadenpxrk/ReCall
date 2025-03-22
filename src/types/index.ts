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

// Message type for conversation
export interface Message {
  id: string;
  content: string;
  role: "user" | "assistant";
  timestamp: number;
}

// Popup component types
export interface PopupSettings {
  apiKey: string;
  preferences: string;
}

export interface PopupProps {
  initialSettings?: Partial<PopupSettings>;
  onSave?: (settings: PopupSettings) => void;
  className?: string;
}

// Form schema types
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
