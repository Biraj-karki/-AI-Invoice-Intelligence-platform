import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, login, register } from "@/lib/api";
import { getToken, setToken } from "@/lib/session";

import LoginForm from "./LoginForm";

const replace = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    login: vi.fn(),
    register: vi.fn(),
  };
});

vi.mock("@/lib/session", () => ({
  getToken: vi.fn(),
  setToken: vi.fn(),
}));

const TOKEN = { access_token: "signed-token", token_type: "bearer" };

beforeEach(() => {
  replace.mockReset();
  vi.mocked(login).mockReset();
  vi.mocked(register).mockReset();
  vi.mocked(getToken).mockReset();
  vi.mocked(getToken).mockReturnValue(null);
  vi.mocked(setToken).mockReset();
});

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText("Email"));
  await user.type(screen.getByLabelText("Email"), email);
  await user.clear(screen.getByLabelText("Password"));
  await user.type(screen.getByLabelText("Password"), password);
  return user;
}

describe("LoginForm — signing in", () => {
  it("stores the token and opens the workspace", async () => {
    vi.mocked(login).mockResolvedValue(TOKEN);

    render(<LoginForm />);
    const user = await fill("owner@example.com", "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(setToken).toHaveBeenCalledWith("signed-token"),
    );
    expect(login).toHaveBeenCalledWith(
      "owner@example.com",
      "correct-horse-battery",
    );
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("leaves the form clean for the next sign-in", async () => {
    vi.mocked(login).mockResolvedValue(TOKEN);

    render(<LoginForm />);
    const user = await fill("owner@example.com", "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));

    // Next can keep this page mounted while the workspace is open, so after a
    // sign-out the user lands back on this very instance: no leftover
    // password and no button stuck on "Signing in…".
    expect(screen.getByLabelText("Password")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows the server's message and stays put when the password is wrong", async () => {
    vi.mocked(login).mockRejectedValue(
      new ApiError("Incorrect email or password.", 401),
    );

    render(<LoginForm />);
    const user = await fill("owner@example.com", "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Incorrect email or password.",
    );
    expect(setToken).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    // The button must be usable again for a second attempt.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("does not call the API for an obviously invalid email", async () => {
    render(<LoginForm />);
    const user = await fill("not-an-email", "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter a valid email address.",
    );
    expect(login).not.toHaveBeenCalled();
  });

  it("leaves the form for someone who already has a session", async () => {
    vi.mocked(getToken).mockReturnValue("existing-token");

    render(<LoginForm />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});

describe("LoginForm — creating an account", () => {
  async function switchToRegister() {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    return user;
  }

  it("checks the password length before calling the API", async () => {
    const user = await switchToRegister();

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 8 characters",
    );
    expect(register).not.toHaveBeenCalled();
  });

  it("registers, stores the token and opens the workspace", async () => {
    vi.mocked(register).mockResolvedValue(TOKEN);
    const user = await switchToRegister();

    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "long-enough-password");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(register).toHaveBeenCalledWith(
        "new@example.com",
        "long-enough-password",
      ),
    );
    expect(setToken).toHaveBeenCalledWith("signed-token");
    expect(replace).toHaveBeenCalledWith("/");
    // Back to sign-in mode: the account now exists, so "create account" would
    // only produce a 409 if the page is shown again.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create account" })).toBeNull();
  });

  it("reports a duplicate email without wiping the form", async () => {
    vi.mocked(register).mockRejectedValue(
      new ApiError("An account with this email already exists.", 409),
    );
    const user = await switchToRegister();

    await user.type(screen.getByLabelText("Email"), "owner@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
    expect(screen.getByLabelText("Email")).toHaveValue("owner@example.com");
    expect(setToken).not.toHaveBeenCalled();
  });
});
