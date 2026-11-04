// Adds the DOM matchers (toBeInTheDocument, toHaveTextContent, ...) to expect.
import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// Vitest does not run with `globals: true`, so Testing Library cannot register
// its own afterEach hook. Without this, every render would leak into the next
// test and getByText would start finding duplicates.
afterEach(() => {
  cleanup();
});
