import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, getMe } from "@/lib/api";
import { clearToken, getToken } from "@/lib/session";

import AuthGate from "./AuthGate";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, getMe: vi.fn() };
});

vi.mock("@/lib/session", () => ({
  getToken: vi.fn(),
  clearToken: vi.fn(),
}));

beforeEach(() => {
  replace.mockReset();
  vi.mocked(getMe).mockReset();
  vi.mocked(getToken).mockReset();
  vi.mocked(clearToken).mockReset();
});

describe("AuthGate", () => {
  it("sends a visitor with no token to the login page", async () => {
    vi.mocked(getToken).mockReturnValue(null);

    render(
      <AuthGate>
        <p>Secret invoices</p>
      </AuthGate>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login"));
    expect(screen.queryByText("Secret invoices")).toBeNull();
    // No point asking the API who we are without a token.
    expect(getMe).not.toHaveBeenCalled();
  });

  it("renders the page once the token is confirmed", async () => {
    vi.mocked(getToken).mockReturnValue("good-token");
    vi.mocked(getMe).mockResolvedValue({
      id: 1,
      email: "owner@example.com",
      created_at: "2026-11-18T10:00:00Z",
    });

    render(
      <AuthGate>
        <p>Secret invoices</p>
      </AuthGate>,
    );

    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    expect(await screen.findByText("Secret invoices")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("discards an expired token and redirects", async () => {
    vi.mocked(getToken).mockReturnValue("expired-token");
    vi.mocked(getMe).mockRejectedValue(
      new ApiError("The session token is invalid or has expired.", 401),
    );

    render(
      <AuthGate>
        <p>Secret invoices</p>
      </AuthGate>,
    );

    await waitFor(() => expect(clearToken).toHaveBeenCalled());
    expect(replace).toHaveBeenCalledWith("/login");
    expect(screen.queryByText("Secret invoices")).toBeNull();
  });

  it("still renders the page when the API is unreachable", async () => {
    vi.mocked(getToken).mockReturnValue("good-token");
    // Status 0 is the "cannot reach the API" case, not a rejected session.
    vi.mocked(getMe).mockRejectedValue(new ApiError("Cannot reach the API.", 0));

    render(
      <AuthGate>
        <p>Secret invoices</p>
      </AuthGate>,
    );

    expect(await screen.findByText("Secret invoices")).toBeInTheDocument();
    expect(clearToken).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
