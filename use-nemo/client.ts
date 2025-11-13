/**
 * Client-side HMR handler for custom directives
 * This file is injected into the app by the Vite plugin
 */

if (import.meta.hot) {
  import.meta.hot.on(
    "custom-directive:update",
    (event: { directive: string }) => {
      console.log(`[HMR] Directive updated: ${event.directive}`);
      // Force a full page reload when directive changes
      window.location.reload();
    }
  );

  import.meta.hot.send("custom-directive:ready");
}
