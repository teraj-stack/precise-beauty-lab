import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".output", ".vinxi"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
        },
      ],
      // Block the deprecated `CaptureAuditInsertResult` alias from creeping
      // back in. Always use `CaptureAuditSubmitResult` from
      // `@/lib/camera/capture-audit-types`.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportSpecifier[imported.name='CaptureAuditInsertResult'], ExportSpecifier[exported.name='CaptureAuditInsertResult'], TSTypeReference[typeName.name='CaptureAuditInsertResult'], TSTypeAliasDeclaration[id.name='CaptureAuditInsertResult'], TSInterfaceDeclaration[id.name='CaptureAuditInsertResult']",
          message:
            "CaptureAuditInsertResult is deprecated and removed. Import CaptureAuditSubmitResult from '@/lib/camera/capture-audit-types' instead.",
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
  eslintPluginPrettier,
);
