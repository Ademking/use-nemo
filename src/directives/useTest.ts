import { directiveRegistry, getAllDirectiveScopes } from "../../use-nemo";
import type { DirectiveHandler } from "../../use-nemo";

const useTest: DirectiveHandler = {
  name: "test",
  handler(code) {
    const scopes = getAllDirectiveScopes(code, "test");
    if (scopes.length > 0) {
      for (const scope of scopes) {
        console.log(`Found directive in function: ${scope.functionName}`);
        console.log(`Function code:\n${scope.functionCode}`);
      }
    }
    return code;
  },
};

directiveRegistry.register(useTest);
