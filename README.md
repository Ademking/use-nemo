# Custom Directives Library

A Vite plugin that enables React-like directives in your JavaScript/TypeScript code.

## Overview

This library allows you to create custom directives similar to React's `"use client"` or `"use server"`. Directives are special string annotations that trigger custom transformations during the Vite build process.

## Inspiration

![](https://i.imgur.com/6gUovwn.png)

Seeing this meme inspired the creation of this library, allowing developers to define their own directives and associated behaviors in a flexible manner.

You want a `"use nemo"` directive? You got it!
You want a `"use cat"` directive? Go ahead!
You want a `"use dog"` directive? Sure thing!
Any directive you can dream of, you can create it!

I realized that many developers could benefit from a system that allows for custom directives, enabling code transformations and behaviors tailored to specific needs.

For example, you could create a `"use analytics"` directive that automatically injects analytics tracking code into your components, or a `"use debug"` directive that adds logging functionality. Or even a `"use feature-flag"` directive that conditionally includes code based on feature flags.

The possibilities are endless!

## Installation

Works with Vite and React projects. (Will add support for other frameworks later, PRs are welcome)

```bash
npm install use-nemo
```

## How to Use

In your `vite.config.ts`, import and add the plugin:

```typescript
// vite.config.ts
import customDirectives from "use-nemo";

export default defineConfig({
  plugins: [customDirectives(), react()],
});
```

## Creating a Directive

### Step 1: Create a directive handler

Create a new file in `src/directives/` directory:

```typescript
// src/directives/useMyDirective.ts
import { directiveRegistry, injectCode } from "use-nemo";
import type { DirectiveHandler } from "use-nemo";

const myDirective: DirectiveHandler = {
  name: "nemo", // This is the name used in "use nemo"
  handler({ code, id, directiveName }) {
    // Transform the code as needed
    return injectCode(code, () => {
      console.log("🐟");
    });
  },
};

directiveRegistry.register(myDirective);
```

### Step 2: Use the directive in your code

```typescript
// src/components/MyComponent.tsx
"use nemo";

export function MyComponent() {
  return <div>My component</div>;
}
```

Demo: [https://stackblitz.com/edit/use-nemo-example](https://stackblitz.com/edit/use-nemo-example?file=src%2Fdirectives%2FuseNemo.ts)

## API Reference

### DirectiveHandler

```typescript
interface DirectiveHandler {
  name: string; // The directive name (without "use" prefix)
  handler(context: DirectiveContext): string | null;
}
```

### DirectiveContext

```typescript
interface DirectiveContext {
  code: string; // The source code
  id: string; // The file identifier
  directiveName: string; // The directive name
}
```

### Helper Functions

#### `injectCode(baseCode, injectionFn)`

Injects executable code into the source:

```typescript
return injectCode(code, () => {
  console.log("This runs when the module loads!");
});
```

#### `injectComment(baseCode, comment)`

Adds a comment to the code:

```typescript
return injectComment(code, "This module uses special processing");
```

#### `injectImport(baseCode, importStatement)`

Adds an import statement at the top:

```typescript
return injectImport(code, 'import { something } from "lib";');
```

## Example: useMeow Directive

The included `useMeow` directive demonstrates how to create a simple directive:

```typescript
// src/directives/useMeow.ts
import { directiveRegistry, injectCode } from "../../custom-directives";
import type { DirectiveHandler } from "../../custom-directives";

const useMeowDirective: DirectiveHandler = {
  name: "meow",
  handler({ code, id }) {
    console.log(`[useMeow] Processing directive in ${id}`);
    return injectCode(code, () => {
      console.log("🐱 Meow!");
    });
  },
};

directiveRegistry.register(useMeowDirective);
```

Usage:

```typescript
"use meow";

function App() {
  return <h1>Hello world!</h1>;
}
```

## How It Works

1. **Discovery**: When you import a directive file (e.g., `import "./directives/useMeow"`), the directive handler is registered in the global registry
2. **Parsing**: The Vite plugin scans source code for directives matching the pattern `"use <name>"`
3. **Transformation**: For each directive found, the corresponding handler transforms the code
4. **Injection**: The transformed code is returned with any injected functionality
5. **Cleanup**: The directive string itself is removed from the final code

## Tips

- Directive names should be lowercase with hyphens (e.g., `use my-directive`)
- Always return the transformed code from the handler, or return `null` to skip transformation
- Use `injectCode`, `injectComment`, or `injectImport` helper functions for common patterns
- Directives are processed once per file during the build
- Multiple directives can be used in the same file

## Best Practices

1. **Keep directives simple**: Each directive should do one thing well
2. **Use TypeScript**: Define clear types for your directive context and handler
3. **Avoid side effects**: Directives should primarily perform transformations, not complex runtime logic

## License

This project is licensed under the MIT License. See the [LICENSE](./LICENSE) file for details.
