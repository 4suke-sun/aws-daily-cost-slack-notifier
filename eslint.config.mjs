import eslintJs from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import gitignore from "eslint-config-flat-gitignore";
import importPlugin from "eslint-plugin-import-x";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    files: ["packages/backend/**/*.{js,mjs,cjs,ts,mts,cts}"],
    ignores: ["packages/sf/**/*"],
  },
  gitignore(),
  eslintJs.configs.recommended,
  importPlugin.flatConfigs.recommended,
  {
    plugins: {
      "unused-imports": unusedImportsPlugin,
      "@stylistic": stylistic,
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "packages/*/tsconfig.json",
        },
      },
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.builtin,
        ...globals.node,
      },
    },
    rules: {
      "brace-style": ["error", "stroustrup", { "allowSingleLine": true }],
      "dot-notation": "error",
      "eqeqeq": ["error", "smart"],
      "linebreak-style": ["error", "unix"],
      "max-len": [
        "error",
        {
          "code": 119,
          "ignoreComments": true,
          "ignoreTrailingComments": true,
          "ignoreUrls": true,
          "ignoreStrings": true,
          "ignoreTemplateLiterals": true,
          "ignoreRegExpLiterals": true,
        },
      ],
      "no-caller": "error",
      "no-constant-condition": ["error", { "checkLoops": false }],
      "no-eval": "error",
      "no-extra-bind": "error",
      "no-multiple-empty-lines": ["error", { max: 2 }],
      "no-new-func": "error",
      "no-new-wrappers": "error",
      "no-throw-literal": "error",
      "no-trailing-spaces": ["error", {
        "skipBlankLines": true,
        "ignoreComments": true,
      }],
      "no-var": "error",
      "object-shorthand": "error",
      "prefer-const": "error",
      "prefer-object-spread": "error",
      "unicode-bom": ["error", "never"],
      "@stylistic/indent": ["error", 2, {
        "SwitchCase": 1,
        "ignoredNodes": [
          "ConditionalExpression",
          "PropertyDefinition[decorators]",
          "TSUnionType",
          "FunctionExpression[params]:has(Identifier[decorators])",
          "TSTypeParameterInstantiation",
          "TSIntersectionType",
        ],
        "VariableDeclarator": "first",
      }],
      "@stylistic/comma-dangle": ["error", {
        "arrays": "always-multiline",
        "objects": "always-multiline",
        "imports": "always-multiline",
        "exports": "always-multiline",
        "functions": "only-multiline",
        "enums": "always-multiline",
        "generics": "always-multiline",
        "tuples": "always-multiline",
      }],
      "@stylistic/eol-last": ["error", "always"],
      "@stylistic/member-delimiter-style": ["error", {
        "multiline": { "delimiter": "semi", "requireLast": true },
        "singleline": { "delimiter": "semi", "requireLast": false },
        "multilineDetection": "brackets",
      }],
      "@stylistic/quotes": ["warn", "double", {
        "avoidEscape": true,
        "allowTemplateLiterals": "always",
      }],
      "@stylistic/semi": ["error", "always"],
      "@stylistic/space-before-blocks": ["error", "always"],
      "@stylistic/space-before-function-paren": ["error", {
        "anonymous": "never",
        "named": "never",
        "asyncArrow": "always",
      }],
      "import-x/default": "off",
      "import-x/namespace": "off",
      "import-x/order": ["error", {
        "groups": [
          "builtin",
          "external",
          "internal",
          "parent",
          "sibling",
          "index",
          "object",
          "type",
        ],
        "newlines-between": "always",
        "alphabetize": {
          "order": "asc",
          "caseInsensitive": false,
        },
      }],
      "import-x/no-duplicates": "error",
      "unused-imports/no-unused-imports": "error",
    },
  },
  {
    "files": ["*.mjs", "*.mts"],
    "rules": {
      "no-restricted-globals": [
        "error",
        { "name": "__filename" },
        { "name": "__dirname" },
        { "name": "require" },
        { "name": "module" },
        { "name": "exports" },
      ],
    },
  },
  ...tseslint.config(
    {
      files: ["packages/**/*.{ts,mts,cts}"],
      languageOptions: {
        parserOptions: {
          "ecmaVersion": "latest",
          "project": [
            "packages/backend/tsconfig.json",
            "packages/backend/assets/lambda/notifier/tsconfig.json",
          ],
        },
      },
      extends: [
        tseslint.configs.strict,
        tseslint.configs.stylistic,
      ],
      rules: {
        "no-unused-vars": "off",
        "@typescript-eslint/no-unused-vars": [
          "error",
          {
            "varsIgnorePattern": "^_",
            "argsIgnorePattern": "^_",
          },
        ],
        "@typescript-eslint/no-explicit-any": ["error", {
          "ignoreRestArgs": true,
        }],
        "@typescript-eslint/no-unsafe-argument": "error",
        "@typescript-eslint/no-unsafe-assignment": "error",
        "@typescript-eslint/no-unsafe-call": "error",
        "@typescript-eslint/no-unsafe-member-access": "error",
        "@typescript-eslint/no-unsafe-return": "error",
        "@typescript-eslint/explicit-function-return-type": "off",
        "@typescript-eslint/explicit-module-boundary-types": "off",
        "@typescript-eslint/naming-convention": [
          "error",
          { "selector": "typeLike", "format": ["PascalCase"], "filter": { "regex": "^[A-Za-z]+_[A-Za-z]+$", "match": false } },
          { "selector": "interface", "format": ["PascalCase"], "custom": { "regex": "^I[A-Z]", "match": false }, "filter": { "regex": "^I[A-Z][a-z]+[A-Za-z]*$", "match": false } },
          { "selector": "variable", "format": ["camelCase", "PascalCase", "UPPER_CASE"], "leadingUnderscore": "allowSingleOrDouble", "filter": { "regex": "^[A-Za-z]+_[A-Za-z]+$", "match": false } },
          { "selector": "function", "format": ["camelCase", "PascalCase"], "leadingUnderscore": "allow", "filter": { "regex": "^[A-Za-z]+_[A-Za-z]+$", "match": false } },
          { "selector": "parameter", "format": ["camelCase"], "leadingUnderscore": "allow", "filter": { "regex": "^(_+|[A-Za-z]+_[A-Z][a-z]+)$", "match": false } },
          { "selector": "method", "format": ["camelCase", "PascalCase"], "leadingUnderscore": "allow", "filter": { "regex": "^([0-9]+|[A-Za-z]+_[A-Za-z]+)$", "match": false } },
          { "selector": "memberLike", "format": ["camelCase"], "leadingUnderscore": "allow", "filter": { "regex": "^([0-9]+|[A-Za-z]+_[A-Za-z]+)$", "match": false } },
          { "selector": "enumMember", "format": ["camelCase", "PascalCase"], "leadingUnderscore": "allow", "filter": { "regex": "^[A-Za-z]+_[A-Za-z]+$", "match": false } },
          { "selector": "property", "format": null },
          { "selector": "typeParameter", "format": ["PascalCase"], "leadingUnderscore": "allow", "filter": { "regex": "^[A-Za-z]+_[A-Za-z]+$", "match": false } },
        ],
        "@typescript-eslint/ban-ts-comment": ["error", {
          "minimumDescriptionLength": 8,
          "ts-expect-error": "allow-with-description",
        }],
        "@typescript-eslint/no-non-null-asserted-optional-chain": "off",
        "@typescript-eslint/class-literal-property-style": "off",
        "@typescript-eslint/consistent-indexed-object-style": "off",
      },
    },
  ),
  {
    "files": ["**/*.{js,cjs,mjs,jsx}"],
    "rules": {
      "no-unused-vars": [
        "error",
        {
          "varsIgnorePattern": "^_",
          "argsIgnorePattern": "^_",
        },
      ],
    },
  },
];
