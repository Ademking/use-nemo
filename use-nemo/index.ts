/**
 * Vite Plugin for Custom Directives
 *
 * This plugin processes custom directives in your source files.
 * Directives are auto-discovered from src/directives/ folder
 *
 * Usage in vite.config.ts:
 *   import customDirectives from "use-nemo";
 *   plugins: [customDirectives(), react()]
 */

/**
 * Simple JSX transpiler to convert JSX syntax to React.createElement calls
 * Only transpiles actual JSX expressions, not strings
 */
function transpileJSX(code: string): string {
  let result = code;

  // Transpile unquoted JSX patterns only
  // Match: return <Tag>content</Tag> (not return "<Tag>content</Tag>")
  result = result.replace(
    /return\s+<(\w+)>([^<]*)<\/\1>/g,
    (_match, tag, content) => {
      return `return React.createElement('${tag}', null, '${content
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')}')`;
    }
  );

  // Handle self-closing tags: <Tag/>
  result = result.replace(
    /return\s+<(\w+)\s*\/>/g,
    "return React.createElement('$1')"
  );

  return result;
}

import type { Plugin } from "vite";
import React from "react";
import { directiveRegistry } from "./registry";
import {
  getAllDirectiveScopes,
  getDirectiveScope,
  injectCode,
  injectFunctionCode,
  injectComment,
  injectImport,
  replaceComponent,
  removeComponent,
  wrapComponent,
  replaceAttribute,
  addProp,
  removeProp,
  replaceText,
  replaceDirective,
  removeImport,
  addImport,
  replaceHook,
} from "./helpers";
import fs from "fs";
import path from "path";

const DIRECTIVE_PATTERN = /"use\s+(\w+)";?/g;

export default function customDirectives(): Plugin {
  let rootDir = "";
  let directivesRegistered = false;
  let mainTransformed = false;

  return {
    name: "vite:custom-directive",
    enforce: "pre",

    configResolved(config) {
      rootDir = config.root;
    },

    handleHotUpdate({ file, server }) {
      // Only trigger special HMR handling when directive files change
      const isDirectiveFile =
        file.includes("src/directives/") || file.includes("src\\directives\\");

      if (isDirectiveFile) {
        // Re-register directives from disk with fresh code
        const directivesDir = path.join(rootDir, "src/directives");
        if (fs.existsSync(directivesDir)) {
          const files = fs
            .readdirSync(directivesDir)
            .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

          // Clear old directives using clear() method
          directiveRegistry.clear();

          for (const file of files) {
            const filePath = path.join(directivesDir, file);
            const fileContent = fs.readFileSync(filePath, "utf-8");

            // Fixed regex: use [\s\S]*? instead of [^]*? and remove stray ^
            const handlerMatches = fileContent.matchAll(
              /const\s+\w+\s*:\s*DirectiveHandler\s*=\s*{([\s\S]*?)}\s*;/gm
            );

            for (const match of handlerMatches) {
              const handlerObj = match[1];
              const nameMatch = handlerObj.match(/name\s*:\s*["'](\w+)["']/);
              if (!nameMatch) continue;

              const directiveName = nameMatch[1];

              // Extract handler function body with proper brace matching
              const handlerStartMatch = handlerObj.match(
                /handler\s*\(\s*{[^}]*}\s*\)\s*{/
              );
              if (!handlerStartMatch) continue;

              const startIndex =
                handlerObj.indexOf(handlerStartMatch[0]) +
                handlerStartMatch[0].length;
              let braceCount = 1;
              let endIndex = startIndex;

              // Find the matching closing brace
              for (let i = startIndex; i < handlerObj.length; i++) {
                if (handlerObj[i] === "{") braceCount++;
                if (handlerObj[i] === "}") braceCount--;
                if (braceCount === 0) {
                  endIndex = i;
                  break;
                }
              }

              const handlerBody = handlerObj
                .substring(startIndex, endIndex)
                .trim();

              // Transpile JSX to React.createElement calls
              const transpiledBody = transpileJSX(handlerBody);

              const staticHandler = {
                name: directiveName,
                handler(code: string) {
                  try {
                    const wrappedFn = new Function(
                      "code",
                      "getAllDirectiveScopes",
                      "getDirectiveScope",
                      "injectCode",
                      "injectFunctionCode",
                      "injectComment",
                      "injectImport",
                      "replaceComponent",
                      "removeComponent",
                      "wrapComponent",
                      "replaceAttribute",
                      "addProp",
                      "removeProp",
                      "replaceText",
                      "replaceDirective",
                      "removeImport",
                      "addImport",
                      "replaceHook",
                      "React",
                      `
                      ${transpiledBody}
                    `
                    );
                    const result = wrappedFn(
                      code,
                      getAllDirectiveScopes,
                      getDirectiveScope,
                      injectCode,
                      injectFunctionCode,
                      injectComment,
                      injectImport,
                      replaceComponent,
                      removeComponent,
                      wrapComponent,
                      replaceAttribute,
                      addProp,
                      removeProp,
                      replaceText,
                      replaceDirective,
                      removeImport,
                      addImport,
                      replaceHook,
                      React
                    );
                    return result || code;
                  } catch (e) {
                    console.error(
                      `[custom-directives] Error in ${directiveName} handler:`,
                      e
                    );
                    return code;
                  }
                },
              };

              directiveRegistry.register(staticHandler);
            }
          }
        }

        // Reset flags to force retransform of all files
        directivesRegistered = false;
        mainTransformed = false;

        // Invalidate the changed directive file
        const changedModule = server.moduleGraph.getModuleById(file);
        if (changedModule) {
          server.moduleGraph.invalidateModule(changedModule);
        }

        // Invalidate ALL files in src that use directives (they need retransform with fresh handlers)
        const srcModules = [];
        for (const [id, module] of server.moduleGraph.idToModuleMap) {
          if (
            id.includes("/src/") &&
            (id.endsWith(".tsx") || id.endsWith(".ts")) &&
            !id.includes("node_modules")
          ) {
            server.moduleGraph.invalidateModule(module);
            srcModules.push(module);
          }
        }

        // Send full-reload to browser to guarantee fresh directive execution
        server.ws.send({
          type: "full-reload",
        });

        return;
      }
    },
    async transform(code, id) {
      // **PHASE 1**: Register all directives from directive files before processing anything else
      if (!directivesRegistered && rootDir) {
        const directivesDir = path.join(rootDir, "src/directives");

        if (fs.existsSync(directivesDir)) {
          // Clear registry to ensure fresh registration
          directiveRegistry.clear();

          const files = fs
            .readdirSync(directivesDir)
            .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

          for (const file of files) {
            const filePath = path.join(directivesDir, file);
            const fileContent = fs.readFileSync(filePath, "utf-8");

            // Parse the directive definitions from source code
            // Fixed regex: use [\s\S]*? instead of [^]*? and remove stray ^
            const handlerMatches = fileContent.matchAll(
              /const\s+\w+\s*:\s*DirectiveHandler\s*=\s*{([\s\S]*?)}\s*;/gm
            );

            for (const match of handlerMatches) {
              const handlerObj = match[1];

              // Extract name
              const nameMatch = handlerObj.match(/name\s*:\s*["'](\w+)["']/);
              if (!nameMatch) continue;

              const directiveName = nameMatch[1];

              // Extract handler function body with proper brace matching
              const handlerStartMatch = handlerObj.match(
                /handler\s*\([^)]*\)\s*{/
              );
              if (!handlerStartMatch) continue;

              const startIndex =
                handlerObj.indexOf(handlerStartMatch[0]) +
                handlerStartMatch[0].length;
              let braceCount = 1;
              let endIndex = startIndex;

              // Find the matching closing brace
              for (let i = startIndex; i < handlerObj.length; i++) {
                if (handlerObj[i] === "{") braceCount++;
                if (handlerObj[i] === "}") braceCount--;
                if (braceCount === 0) {
                  endIndex = i;
                  break;
                }
              }

              const handlerBody = handlerObj
                .substring(startIndex, endIndex)
                .trim();

              // Transpile JSX to React.createElement calls
              const transpiledBody = transpileJSX(handlerBody);

              // Create a wrapper handler that uses injectCode
              const staticHandler = {
                name: directiveName,
                handler(code: string) {
                  // Execute the handler body in a controlled context
                  // The handler uses injectCode from helpers, so make it available
                  try {
                    // Wrap in a function that has access to helper functions
                    const wrappedFn = new Function(
                      "code",
                      "getAllDirectiveScopes",
                      "getDirectiveScope",
                      "injectCode",
                      "injectFunctionCode",
                      "injectComment",
                      "injectImport",
                      "replaceComponent",
                      "removeComponent",
                      "wrapComponent",
                      "replaceAttribute",
                      "addProp",
                      "removeProp",
                      "replaceText",
                      "replaceDirective",
                      "removeImport",
                      "addImport",
                      "replaceHook",
                      "React",
                      `
                      ${transpiledBody}
                    `
                    );
                    const result = wrappedFn(
                      code,
                      getAllDirectiveScopes,
                      getDirectiveScope,
                      injectCode,
                      injectFunctionCode,
                      injectComment,
                      injectImport,
                      replaceComponent,
                      removeComponent,
                      wrapComponent,
                      replaceAttribute,
                      addProp,
                      removeProp,
                      replaceText,
                      replaceDirective,
                      removeImport,
                      addImport,
                      replaceHook,
                      React
                    );
                    return result || code;
                  } catch (e) {
                    console.error(
                      `[custom-directives] Error in ${directiveName} handler:`,
                      e
                    );
                    return code;
                  }
                },
              };

              // Register the static handler
              directiveRegistry.register(staticHandler);
            }
          }

          directivesRegistered = true;
        }
      }

      // **PHASE 2**: Transform main.tsx to inject directive imports
      if (
        !mainTransformed &&
        (id.endsWith("main.tsx") || id.endsWith("main.ts"))
      ) {
        mainTransformed = true;
        const directivesDir = path.join(rootDir, "src/directives");

        if (fs.existsSync(directivesDir)) {
          const files = fs
            .readdirSync(directivesDir)
            .filter((f) => f.endsWith(".ts") || f.endsWith(".tsx"));

          // Generate imports for all directive files
          const directiveImports = files
            .map((file) => `import "./directives/${file}";`)
            .join("\n");

          const newCode = directiveImports + "\n\n" + code;

          return {
            code: newCode,
            map: null,
          };
        }
      }

      // **PHASE 3**: Transform directive definition files - REMOVE registration code
      // This prevents them from re-registering at runtime
      if (id.includes("src/directives/") && !id.includes("node_modules")) {
        // Remove the registration line: directiveRegistry.register(...);
        // This regex handles single and multi-line calls
        let transformedCode = code.replace(
          /\s*directiveRegistry\.register\([^)]*\)\s*;\s*/g,
          ""
        );

        // Also remove empty lines left behind
        transformedCode = transformedCode.replace(/\n\s*\n/g, "\n");

        if (transformedCode !== code) {
          return {
            code: transformedCode,
            map: null,
          };
        }

        return null;
      }

      // **PHASE 4**: Apply directives and KEEP the "use" strings for HMR
      // Skip non-source files
      if (!["ts", "tsx", "js", "jsx"].some((ext) => id.endsWith(`.${ext}`))) {
        return null;
      }

      if (id.includes("node_modules")) {
        return null;
      }

      // Check if code contains a directive
      const directives = code.match(DIRECTIVE_PATTERN);

      if (!directives) {
        return null;
      }

      let transformedCode = code;
      const processedDirectives = new Set<string>();

      for (const directiveMatch of directives) {
        const directiveName = directiveMatch.match(/"use\s+(\w+)"/)?.[1];

        if (!directiveName || processedDirectives.has(directiveName)) {
          continue;
        }

        processedDirectives.add(directiveName);
        const handler = directiveRegistry.getDirective(directiveName);

        if (handler) {
          const result = handler.handler(transformedCode);

          if (result !== null) {
            transformedCode = result;
          }

          // DON'T remove the directive - keep it for HMR re-transforms
          // transformedCode = transformedCode.replace(
          //   new RegExp(`"use\\s+${directiveName}";?\\s*`, "g"),
          //   ""
          // );
        }
      }

      if (transformedCode !== code) {
        return {
          code: transformedCode,
          map: null,
        };
      }
    },
  };
}

export { directiveRegistry } from "./registry";
export {
  getAllDirectiveScopes,
  getDirectiveScope,
  injectCode,
  injectFunctionCode,
  injectComment,
  injectImport,
  replaceComponent,
  removeComponent,
  wrapComponent,
  replaceAttribute,
  addProp,
  removeProp,
  replaceText,
  replaceDirective,
  removeImport,
  addImport,
  replaceHook,
} from "./helpers";
export type {
  DirectiveContext,
  DirectiveHandler,
  DirectiveScope,
  Directives,
  DirectiveRegistrar,
} from "./types";
