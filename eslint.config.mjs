import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // El código heredado usa `any` en muchas respuestas de APIs externas: aviso, no error (C4).
  { rules: { "@typescript-eslint/no-explicit-any": "warn" } },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Scripts de Photoshop (ExtendScript), no JavaScript moderno.
    "scripts/**/*.jsx",
  ]),
]);

export default eslintConfig;
