// ESLint's recommended rules for the SDK's browser and service worker modules, used by
// .github/workflows/static_analysis.yml. The workflow copies this file next to the ESLint it installs, so the
// imports below resolve there.
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.serviceworker },
    },
  },
];
