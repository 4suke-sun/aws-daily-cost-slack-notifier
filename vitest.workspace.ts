// VSCodeの拡張 `Vitest` に一覧を列挙するためだけのファイルです。
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "**/vitest.config.ts",
  "**/vitest.cdk.config.ts",
]);
