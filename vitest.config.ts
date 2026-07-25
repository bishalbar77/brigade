import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // lib/runway/ is pure functions with no DOM and no Supabase imports, so the
    // maths is testable without a database or a browser environment.
    include: ["lib/**/*.test.ts"],
    environment: "node",
  },
});
