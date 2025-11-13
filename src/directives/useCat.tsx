import { directiveRegistry, injectCode } from "../../use-nemo";
import type { DirectiveHandler } from "../../use-nemo";

const useTest: DirectiveHandler = {
  name: "cat",
  handler(code) {
    return injectCode(code, () => console.log("🐈 MEOW"));
  },
};

directiveRegistry.register(useTest);
