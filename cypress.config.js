import { defineConfig } from "cypress";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

export default defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      const codeCoverageTask = require('@cypress/code-coverage/task');
      codeCoverageTask(on, config);

      // Include any other plugin code...

      // IMPORTANT: Return the config object with any changed environment variables
      return config;
    },
  },
  userAgent: "abcd",
});
