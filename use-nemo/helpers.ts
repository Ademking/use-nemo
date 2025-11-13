/**
 * Helper functions for creating directive injections
 */

import type { DirectiveScope } from "./types";

/**
 * Finds the function scope that contains a directive
 * @param code - The source code
 * @param directiveName - The directive name to search for (e.g., "test")
 * @returns Object with function name, code, and position, or null if not found
 */
export const getDirectiveScope = (
  code: string,
  directiveName: string
): DirectiveScope | null => {
  // Search for the directive string in the code
  const directivePattern = new RegExp(`"use\\s+${directiveName}"`, "g");
  const directiveMatch = directivePattern.exec(code);

  if (!directiveMatch) {
    return null;
  }

  const directiveIndex = directiveMatch.index;
  return findFunctionScopeAtIndex(code, directiveIndex);
};

/**
 * Finds all function scopes that contain a directive
 * @param code - The source code
 * @param directiveName - The directive name to search for (e.g., "test")
 * @returns Array of objects with function name, code, and position
 */
export const getAllDirectiveScopes = (
  code: string,
  directiveName: string
): DirectiveScope[] => {
  const scopes: DirectiveScope[] = [];
  const directivePattern = new RegExp(`"use\\s+${directiveName}"`, "g");

  let match;
  while ((match = directivePattern.exec(code)) !== null) {
    // If directive is at the start of the file, return all code
    if (match.index === 0 || code.substring(0, match.index).trim() === "") {
      return [
        {
          functionName: "global",
          functionCode: code,
          startIndex: 0,
          endIndex: code.length,
        },
      ];
    }

    const scope = findFunctionScopeAtIndex(code, match.index);
    if (scope) {
      scopes.push(scope);
    }
  }

  return scopes;
};

/**
 * Helper function to find function scope at a specific index
 * @param code - The source code
 * @param directiveIndex - The index of the directive in the code
 * @returns Object with function name, code, and position, or null if not found
 */
function findFunctionScopeAtIndex(
  code: string,
  directiveIndex: number
): DirectiveScope | null {
  // Find which function this directive belongs to by scanning backwards for function start
  let braceCount = 0;
  let functionStartIndex = -1;

  // Scan backwards to find the opening brace of the function
  for (let i = directiveIndex - 1; i >= 0; i--) {
    if (code[i] === "}") braceCount++;
    if (code[i] === "{") {
      braceCount--;
      if (braceCount < 0) {
        functionStartIndex = i;
        break;
      }
    }
  }

  if (functionStartIndex === -1) {
    return null;
  }

  // Now find the function name by scanning backwards from the opening brace
  const beforeBrace = code.substring(0, functionStartIndex);
  const functionNameMatch = beforeBrace.match(
    /(?:function|const)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\(|=)/
  );

  if (!functionNameMatch) {
    return null;
  }

  const functionName = functionNameMatch[1];

  // Find the matching closing brace
  let closingBraceIndex = functionStartIndex + 1;
  braceCount = 1;
  let inString = false;
  let stringChar = "";

  while (closingBraceIndex < code.length && braceCount > 0) {
    const char = code[closingBraceIndex];

    if (!inString && (char === '"' || char === "'" || char === "`")) {
      inString = true;
      stringChar = char;
    } else if (
      inString &&
      char === stringChar &&
      code[closingBraceIndex - 1] !== "\\"
    ) {
      inString = false;
    }

    if (!inString) {
      if (char === "{") braceCount++;
      if (char === "}") braceCount--;
    }

    closingBraceIndex++;
  }

  const functionCode = code.substring(functionStartIndex, closingBraceIndex);

  return {
    functionName,
    functionCode,
    startIndex: functionStartIndex,
    endIndex: closingBraceIndex,
  };
}

/**
 * Extracts all function definitions from code
 * @param code - The source code
 * @returns Array of extracted functions
 */
export const extractFunctions = (code: string): string[] => {
  const functions: string[] = [];

  // Match function declarations: function name() { ... }
  const funcDeclPattern =
    /function\s+\w+\s*\([^)]*\)\s*\{(?:[^{}]|{[^{}]*})*\}/g;
  const funcDecls = code.match(funcDeclPattern) || [];
  functions.push(...funcDecls);

  // Match const arrow functions: const name = () => { ... }
  const arrowFuncPattern =
    /const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{(?:[^{}]|{[^{}]*})*\}/g;
  const arrowFuncs = code.match(arrowFuncPattern) || [];
  functions.push(...arrowFuncs);

  // Match method definitions: methodName() { ... }
  const methodPattern = /\w+\s*\([^)]*\)\s*\{(?:[^{}]|{[^{}]*})*\}/g;
  const methods = code.match(methodPattern) || [];
  functions.push(...methods);

  return functions;
};

/**
 * Injects code execution into the source code (global scope)
 * Adds code at the top level of the file/component
 * @param baseCode - The original source code
 * @param injectionFn - Function to execute immediately
 * @param context - Optional context variables to inject into the IIFE
 * @returns Transformed code with injection
 */
export const injectCode = (
  baseCode: string,
  injectionFn: () => void,
  context?: Record<string, unknown>
): string => {
  if (context) {
    // If context is provided, pass variables as parameters to the IIFE
    const contextKeys = Object.keys(context);
    const contextValues = contextKeys.map((key) =>
      JSON.stringify(context[key])
    );
    const fnStr = injectionFn.toString();
    // Extract function body between the outermost braces
    const bodyMatch = fnStr.match(/\{([\s\S]*)\}$/);
    const body = bodyMatch ? bodyMatch[1] : "";
    const iife = `(function(${contextKeys.join(
      ", "
    )}) {${body}})(${contextValues.join(", ")});`;
    return [baseCode, iife].join("\n");
  }
  // Wrap the function in an IIFE to execute it immediately
  const iife = `(${injectionFn.toString()})();`;
  return [baseCode, iife].join("\n");
};

/**
 * Injects code into function bodies (function scope)
 * Finds all function declarations/arrows and injects code at the start
 * @param baseCode - The original source code
 * @param injectionCode - Code to inject into functions (as string)
 * @returns Transformed code with injections in function bodies
 */
export const injectFunctionCode = (
  baseCode: string,
  injectionCode: string
): string => {
  // Only match actual function declarations and arrow functions, not JSX expressions
  const patterns = [
    // Regular function declarations: function name() { ... }
    /(\bfunction\s+\w+\s*\([^)]*\)\s*\{)/g,
    // Arrow functions with const: const x = () => { or const x = async () => {
    /(\bconst\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{)/g,
  ];

  let result = baseCode;

  for (const pattern of patterns) {
    result = result.replace(pattern, (match) => {
      // Insert the injection code right after the opening brace
      return match + "\n" + injectionCode + "\n";
    });
  }

  return result;
};

// ============================================================================
// CODE REPLACEMENT HELPERS
// ============================================================================

/**
 * Replaces a specific component usage with another
 * @param code - The source code
 * @param componentName - Component to replace (e.g., "Button")
 * @param replacementComponent - Component to replace it with (e.g., "CustomButton")
 * @returns Transformed code with component replaced
 */
export const replaceComponent = (
  code: string,
  componentName: string,
  replacementComponent: string
): string => {
  // Match component usage: <ComponentName ... /> or <ComponentName>...</ComponentName>
  const pattern = new RegExp(
    `<${componentName}(\\s[^>]*)?>([^<]*(?:<(?!/?${componentName}\\b)[^<]*)*(?:<${componentName}[^>]*>.*?</\\s*${componentName}\\s*>)?[^<]*)(?:</\\s*${componentName}\\s*>)?`,
    "g"
  );
  return code.replace(
    pattern,
    `<${replacementComponent}$1>$2</${replacementComponent}>`
  );
};

/**
 * Removes a specific component from code
 * @param code - The source code
 * @param componentName - Component to remove
 * @returns Code with component removed (keeps children)
 */
export const removeComponent = (
  code: string,
  componentName: string
): string => {
  // Simple removal: <Component>children</Component> -> children
  const selfClosingPattern = new RegExp(
    `<${componentName}\\s*(?:[^>]*?)\\s*/>`,
    "g"
  );
  const openClosePattern = new RegExp(
    `<${componentName}(?:\\s[^>]*)?>([^<]*(?:<(?!/?${componentName}\\b)[^<]*)*)</\\s*${componentName}\\s*>`,
    "g"
  );

  let result = code.replace(selfClosingPattern, "");
  result = result.replace(openClosePattern, "$1");
  return result;
};

/**
 * Wraps a component with another component
 * @param code - The source code
 * @param componentName - Component to wrap
 * @param wrapperComponent - Component to wrap with
 * @param wrapperProps - Optional props for the wrapper component
 * @returns Code with component wrapped
 */
export const wrapComponent = (
  code: string,
  componentName: string,
  wrapperComponent: string,
  wrapperProps: string = ""
): string => {
  const pattern = new RegExp(
    `(<${componentName}(?:\\s[^>]*)?(?:>.*?</\\s*${componentName}\\s*>|\\s*/?>))`,
    "g"
  );
  return code.replace(
    pattern,
    `<${wrapperComponent}${wrapperProps}>$1</${wrapperComponent}>`
  );
};

/**
 * Replaces JSX attribute values
 * @param code - The source code
 * @param componentName - Component name (optional, if omitted applies to all)
 * @param attributeName - Attribute to replace
 * @param oldValue - Old value
 * @param newValue - New value
 * @returns Code with attributes replaced
 */
export const replaceAttribute = (
  code: string,
  componentName: string | null,
  attributeName: string,
  oldValue: string | RegExp,
  newValue: string
): string => {
  const componentPattern = componentName ? `<${componentName}` : "<[A-Z]";
  const pattern = new RegExp(
    `(${componentPattern}[^>]*${attributeName}=)${
      oldValue instanceof RegExp ? `"${oldValue.source}"` : `"${oldValue}"`
    }`,
    "g"
  );
  return code.replace(pattern, `$1"${newValue}"`);
};

/**
 * Adds a prop to a component
 * @param code - The source code
 * @param componentName - Component name
 * @param propName - Prop to add
 * @param propValue - Prop value
 * @returns Code with prop added
 */
export const addProp = (
  code: string,
  componentName: string,
  propName: string,
  propValue: string
): string => {
  const pattern = new RegExp(`(<${componentName}(?:\\s[^>]*)?)([\\s/>])`, "g");
  return code.replace(pattern, `$1 ${propName}="${propValue}"$2`);
};

/**
 * Removes a prop from a component
 * @param code - The source code
 * @param componentName - Component name
 * @param propName - Prop to remove
 * @returns Code with prop removed
 */
export const removeProp = (
  code: string,
  componentName: string,
  propName: string
): string => {
  const pattern = new RegExp(
    `<${componentName}[^>]*\\s${propName}(?:=(?:"[^"]*"|'[^']*'))?[^>]*>`,
    "g"
  );
  return code.replace(pattern, (match) => {
    return match.replace(
      new RegExp(`\\s${propName}(?:=(?:"[^"]*"|'[^']*'))?`),
      ""
    );
  });
};

/**
 * Replaces text content in JSX
 * @param code - The source code
 * @param oldText - Text to find
 * @param newText - Text to replace with
 * @returns Code with text replaced
 */
export const replaceText = (
  code: string,
  oldText: string,
  newText: string
): string => {
  return code.replace(new RegExp(oldText, "g"), newText);
};

/**
 * Removes import statements
 * @param code - The source code
 * @param importName - Import to remove (e.g., "useState", or full module "react")
 * @returns Code with import removed
 */
export const removeImport = (code: string, importName: string): string => {
  // Remove specific named import
  const namedPattern = new RegExp(
    `import\\s*\\{[^}]*${importName}[^}]*\\}\\s*from\\s*["'][^"']*["'];?\\s*\\n?`,
    "g"
  );
  let result = code.replace(namedPattern, "");

  // Also handle: import X from "module"
  const defaultPattern = new RegExp(
    `import\\s+${importName}\\s+from\\s+["'][^"']*["'];?\\s*\\n?`,
    "g"
  );
  result = result.replace(defaultPattern, "");

  return result;
};

/**
 * Adds an import statement
 * @param code - The source code
 * @param importStatement - Full import statement (e.g., "import { useState } from 'react'")
 * @returns Code with import added at the top
 */
export const addImport = (code: string, importStatement: string): string => {
  // Avoid duplicates
  if (code.includes(importStatement)) {
    return code;
  }
  return `${importStatement}\n${code}`;
};

/**
 * Replaces a hook usage with another
 * @param code - The source code
 * @param hookName - Hook to replace (e.g., "useState")
 * @param replacementHook - Hook to replace with (e.g., "useRecoilState")
 * @returns Code with hook replaced
 */
export const replaceHook = (
  code: string,
  hookName: string,
  replacementHook: string
): string => {
  return code.replace(new RegExp(`\\b${hookName}\\b`, "g"), replacementHook);
};

/**
 * Replaces the directive with provided code
 * @param code - The source code
 * @param directiveName - The directive name (e.g., "cat")
 * @param replacementCode - Code to replace the directive with
 * @returns Code with directive replaced
 */
export const replaceDirective = (
  code: string,
  directiveName: string,
  replacementCode: string | (() => unknown)
): string => {
  const replacement =
    typeof replacementCode === "function" ? replacementCode() : replacementCode;

  // Convert JSX/React elements to proper JSX string representation
  let replacementStr: string;

  if (typeof replacement === "string") {
    replacementStr = replacement;
  } else if (
    replacement &&
    typeof replacement === "object" &&
    "$$typeof" in replacement
  ) {
    // React element - convert to JSX format
    const element = replacement as Record<string, unknown>;
    if (element.type && typeof element.type === "string") {
      // Simple HTML element
      const props = element.props as Record<string, unknown>;
      const children = props?.children || "";
      replacementStr = `<${element.type}>${children}</${element.type}>`;
    } else {
      // Component or complex element - stringify
      replacementStr = JSON.stringify(replacement);
    }
  } else {
    replacementStr = JSON.stringify(replacement);
  }

  return code.replace(
    new RegExp(`"use\\s+${directiveName}";?`, "g"),
    replacementStr
  );
};

/**
 * Injects a comment into the code (useful for debugging/marking)
 * @param baseCode - The original source code
 * @param comment - Comment to inject
 * @returns Code with comment injected
 */
export const injectComment = (baseCode: string, comment: string): string => {
  return `// ${comment}\n${baseCode}`;
};

/**
 * Injects an import statement into the code
 * @param baseCode - The original source code
 * @param importStatement - Import statement to add
 * @returns Code with import injected at the top
 */
export const injectImport = (
  baseCode: string,
  importStatement: string
): string => {
  // Add import at the very beginning
  return `${importStatement}\n${baseCode}`;
};
