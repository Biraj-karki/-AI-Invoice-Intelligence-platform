import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ApiError,
  createAutomationToken,
  getAutomationTokenStatus,
  revokeAutomationToken,
} from "@/lib/api";

import AutomationToken from "./AutomationToken";

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    createAutomationToken: vi.fn(),
    getAutomationTokenStatus: vi.fn(),
    revokeAutomationToken: vi.fn(),
  };
});

beforeEach(() => {
  vi.mocked(createAutomationToken).mockReset();
  vi.mocked(getAutomationTokenStatus).mockReset();
  vi.mocked(revokeAutomationToken).mockReset();
});

describe("AutomationToken", () => {
  it("creates and shows the token once", async () => {
    vi.mocked(getAutomationTokenStatus).mockResolvedValue({ enabled: false });
    vi.mocked(createAutomationToken).mockResolvedValue({
      automation_token: "inv_auto_secret",
    });

    render(<AutomationToken />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create token" }));

    expect(await screen.findByLabelText("Copy this token into n8n now")).toHaveValue(
      "inv_auto_secret",
    );
    expect(screen.getByText(/X-Automation-Token/)).toBeInTheDocument();
  });

  it("requires confirmation before revoking an active token", async () => {
    vi.mocked(getAutomationTokenStatus).mockResolvedValue({ enabled: true });
    vi.mocked(revokeAutomationToken).mockResolvedValue(undefined);

    render(<AutomationToken />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Revoke" }));
    expect(revokeAutomationToken).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Confirm revoke" }),
    );

    expect(revokeAutomationToken).toHaveBeenCalledOnce();
    expect(
      await screen.findByText("No automation token is active."),
    ).toBeInTheDocument();
  });

  it("shows API failures without claiming the operation succeeded", async () => {
    vi.mocked(getAutomationTokenStatus).mockResolvedValue({ enabled: false });
    vi.mocked(createAutomationToken).mockRejectedValue(
      new ApiError("Token creation failed.", 500),
    );

    render(<AutomationToken />);

    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Create token" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Token creation failed.",
    );
    expect(screen.queryByLabelText("Copy this token into n8n now")).toBeNull();
  });
});
