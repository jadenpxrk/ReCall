import type {
  ContactFormValues,
  LoginFormValues,
  SearchFormValues,
} from "~/types";
import { contactSchema, loginSchema, searchSchema } from "~/types";

// Re-export all schemas and types for backward compatibility
export { searchSchema, contactSchema, loginSchema };

export type { SearchFormValues, ContactFormValues, LoginFormValues };
