/**
 * Registry for all custom directives
 *
 * This is a singleton instance that manages all registered directives.
 * Users can register their custom directives by importing and using this registry.
 */

import type {
  DirectiveHandler,
  Directives,
  DirectiveRegistrar,
} from "./types.js";

class DirectiveRegistry implements DirectiveRegistrar {
  private directives: Directives = {};

  register(handler: DirectiveHandler) {
    this.directives[handler.name] = handler;
  }

  getDirective(name: string): DirectiveHandler | undefined {
    return this.directives[name];
  }

  getAllDirectives(): Directives {
    return this.directives;
  }

  isDirective(name: string): boolean {
    return name in this.directives;
  }

  clear() {
    this.directives = {};
  }
}

// Create and export global registry instance
export const directiveRegistry = new DirectiveRegistry();

export default directiveRegistry;
