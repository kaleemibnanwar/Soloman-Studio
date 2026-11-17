import { describe, expect, it } from "vitest";
import { userInputContracts, userInputEvents } from "../../types/user_input";
import { solomanContracts, solomanEvents } from "../../types/soloman";
import { plannerContracts } from "../../types/planner";
import { VALID_INVOKE_CHANNELS, VALID_RECEIVE_CHANNELS } from "../channels";

describe("user-input preload channels", () => {
  it("allows every user-input invoke and receive contract", () => {
    for (const contract of Object.values(userInputContracts)) {
      expect(VALID_INVOKE_CHANNELS).toContain(contract.channel);
    }
    for (const event of Object.values(userInputEvents)) {
      expect(VALID_RECEIVE_CHANNELS).toContain(event.channel);
    }
  });

  it("allows every soloman invoke and receive contract", () => {
    for (const contract of Object.values(solomanContracts)) {
      expect(VALID_INVOKE_CHANNELS).toContain(contract.channel);
    }
    for (const event of Object.values(solomanEvents)) {
      expect(VALID_RECEIVE_CHANNELS).toContain(event.channel);
    }
  });

  it("allows every planner invoke contract", () => {
    for (const contract of Object.values(plannerContracts)) {
      expect(VALID_INVOKE_CHANNELS).toContain(contract.channel);
    }
  });
});
