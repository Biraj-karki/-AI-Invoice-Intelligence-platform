import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, changePassword } from "@/lib/api";

import ChangePassword from "./ChangePassword";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return { ...actual, changePassword: vi.fn() };
});

beforeEach(() => {
  vi.mocked(changePassword).mockReset();
});

async function fill(
  values: {
    current?: string;
    next?: string;
    confirm?: string;
  } = {},
) {
  const user = userEvent.setup();
  const current = values.current ?? "correct-horse-battery";
  const next = values.next ?? "battery-staple-correct";
  const confirm = values.confirm ?? next;

  if (current !== "") {
    await user.type(screen.getByLabelText("Current password"), current);
  }
  if (next !== "") {
    await user.type(screen.getByLabelText("New password"), next);
  }
  if (confirm !== "") {
    await user.type(screen.getByLabelText("Confirm new password"), confirm);
  }

  return user;
}

describe("ChangePassword — checks before sending", () => {
  it("requires the current password", async () => {
    render(<ChangePassword />);

    const user = await fill({ current: "" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter your current password.",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("refuses a new password shorter than 8 characters", async () => {
    render(<ChangePassword />);

    const user = await fill({ next: "short", confirm: "short" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "at least 8 characters",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("refuses a confirmation that does not match", async () => {
    render(<ChangePassword />);

    const user = await fill({ confirm: "something-else-entirely" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The two new passwords do not match.",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("refuses to 'change' to the password already in use", async () => {
    render(<ChangePassword />);

    const user = await fill({ next: "correct-horse-battery" });
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The new password must be different from your current one.",
    );
    expect(changePassword).not.toHaveBeenCalled();
  });
});

describe("ChangePassword — talking to the API", () => {
  it("sends both passwords and confirms the change", async () => {
    vi.mocked(changePassword).mockResolvedValue(undefined);

    render(<ChangePassword />);

    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(changePassword).toHaveBeenCalledWith(
      "correct-horse-battery",
      "battery-staple-correct",
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Password changed.",
    );
    // Cleared, so the next person at this screen sees no password.
    expect(screen.getByLabelText("Current password")).toHaveValue("");
    expect(screen.getByLabelText("New password")).toHaveValue("");
    expect(screen.getByLabelText("Confirm new password")).toHaveValue("");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the server's message and keeps what was typed", async () => {
    vi.mocked(changePassword).mockRejectedValue(
      new ApiError("Current password is incorrect.", 400),
    );

    render(<ChangePassword />);

    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Current password is incorrect.",
    );
    // Retrying should not mean retyping.
    expect(screen.getByLabelText("Current password")).toHaveValue(
      "correct-horse-battery",
    );
    expect(screen.getByRole("button", { name: "Change password" })).toBeEnabled();
  });

  it("does not claim success when the request fails", async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error("offline"));

    render(<ChangePassword />);

    const user = await fill();
    await user.click(screen.getByRole("button", { name: "Change password" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong. Try again.",
    );
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("ChangePassword — visibility toggle", () => {
  it("reveals and hides every field together", async () => {
    render(<ChangePassword />);

    const current = screen.getByLabelText("Current password");
    expect(current).toHaveAttribute("type", "password");

    await userEvent.setup().click(screen.getByLabelText("Show passwords"));

    expect(current).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("New password")).toHaveAttribute("type", "text");
    expect(screen.getByLabelText("Confirm new password")).toHaveAttribute(
      "type",
      "text",
    );
  });
});
