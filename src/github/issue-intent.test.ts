import { describe, expect, it } from "vitest";
import { parseIssueIntent } from "./issue-intent.js";

describe("parseIssueIntent", () => {
  it("parses issue <text> into a body", () => {
    expect(parseIssueIntent("issue login is broken")).toEqual({
      body: "login is broken",
    });
  });

  it("parses /issue <text> into the same body", () => {
    expect(parseIssueIntent("/issue login is broken")).toEqual({
      body: "login is broken",
    });
  });

  it("is case-insensitive on the keyword", () => {
    expect(parseIssueIntent("ISSUE login")).toEqual({ body: "login" });
  });

  it("returns an empty body when only whitespace follows the keyword", () => {
    expect(parseIssueIntent("issue")).toEqual({ body: "" });
    expect(parseIssueIntent("/issue")).toEqual({ body: "" });
    expect(parseIssueIntent("issue   ")).toEqual({ body: "" });
    expect(parseIssueIntent("/issue   ")).toEqual({ body: "" });
  });

  it("returns null unless optional slash + issue is the first word", () => {
    expect(parseIssueIntent("status")).toBeNull();
    expect(parseIssueIntent("ask about the issue tracker")).toBeNull();
    expect(parseIssueIntent("please issue a refund")).toBeNull();
  });

  it("keeps the rest of a multiline body including newlines", () => {
    expect(parseIssueIntent("issue Login fails\n\nSteps: tap Sign in")).toEqual({
      body: "Login fails\n\nSteps: tap Sign in",
    });
  });
});
