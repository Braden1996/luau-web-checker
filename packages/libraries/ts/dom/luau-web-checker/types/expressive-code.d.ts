import type {} from "@expressive-code/core";

interface LuauTypesStyleSettings {
  background: string;
  foreground: string;
  border: string;
  errorColor: string;
  keyword: string;
  type: string;
  builtin: string;
  property: string;
  string: string;
  punctuation: string;
}

declare module "@expressive-code/core" {
  export interface StyleSettings {
    luauTypes: LuauTypesStyleSettings;
  }
}
