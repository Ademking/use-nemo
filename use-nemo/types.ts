/**
 * Types for custom directives
 */

export interface DirectiveContext {
  code: string;
  id: string;
  directiveName: string;
}

export interface DirectiveScope {
  functionName: string;
  functionCode: string;
  startIndex: number;
  endIndex: number;
}

export interface DirectiveHandler {
  name: string;
  handler: (code: string) => string | null;
}

export type Directives = Record<string, DirectiveHandler>;

export interface DirectiveRegistrar {
  register(handler: DirectiveHandler): void;
  getDirective(name: string): DirectiveHandler | undefined;
  getAllDirectives(): Directives;
  isDirective(name: string): boolean;
}
