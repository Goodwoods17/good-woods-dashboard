import { describe, it, expect } from "vitest";
import {
  kickoffPhaseWindow,
  buildKickoffArtifact,
  BASE_UPDATE_PROTOCOL,
  type KickoffArtifactInput,
} from "./kickoffArtifact";

const INSTALL_DATE = "2026-12-15";

const PHASE_TARGETS = {
  design: "2026-09-01", // a Monday → week-of = same
  cnc: "2026-09-10", // a Wednesday → week-of = Monday 2026-09-07
  assembly: "2026-10-01",
};

// ─── kickoffPhaseWindow ───────────────────────────────────────────────────────

describe("kickoffPhaseWindow", () => {
  it("returns the ISO install date for the install phase (the firm promise)", () => {
    expect(kickoffPhaseWindow("install", INSTALL_DATE, PHASE_TARGETS)).toBe(INSTALL_DATE);
  });

  it("returns 'To be scheduled' when a mid-phase has no internal target", () => {
    expect(kickoffPhaseWindow("finishing", INSTALL_DATE, PHASE_TARGETS)).toBe("To be scheduled");
    expect(kickoffPhaseWindow("delivery", INSTALL_DATE, {})).toBe("To be scheduled");
  });

  it("returns a soft week-of string for mid-phases with a target (never the raw date)", () => {
    const result = kickoffPhaseWindow("design", INSTALL_DATE, PHASE_TARGETS);
    expect(result).toMatch(/^Week of \d{4}-\d{2}-\d{2}$/);
    // 2026-09-01 is a Tuesday → Monday of that week is 2026-08-31.
    expect(result).toBe("Week of 2026-08-31");
  });

  it("maps a mid-week target to the MONDAY of that week", () => {
    // 2026-09-10 is a Thursday → Monday of that week is 2026-09-07.
    const result = kickoffPhaseWindow("cnc", INSTALL_DATE, PHASE_TARGETS);
    expect(result).toBe("Week of 2026-09-07");
  });

  it("treats no phaseTargetDates as 'To be scheduled' for all mid-phases", () => {
    expect(kickoffPhaseWindow("assembly", INSTALL_DATE, null)).toBe("To be scheduled");
    expect(kickoffPhaseWindow("assembly", INSTALL_DATE, undefined)).toBe("To be scheduled");
    expect(kickoffPhaseWindow("assembly", INSTALL_DATE, {})).toBe("To be scheduled");
  });
});

// ─── buildKickoffArtifact ─────────────────────────────────────────────────────

describe("buildKickoffArtifact", () => {
  const baseInput: KickoffArtifactInput = {
    jobName: "Saywell Kitchen",
    clientName: "Jane Saywell",
    installDate: INSTALL_DATE,
    phaseTargetDates: PHASE_TARGETS,
  };

  it("generates a subject line naming the job", () => {
    const { subject } = buildKickoffArtifact(baseInput);
    expect(subject).toContain("Saywell Kitchen");
    expect(subject).toContain("Good Woods");
  });

  it("produces a phase line for every milestone (6 phases)", () => {
    const { phaseLines } = buildKickoffArtifact(baseInput);
    expect(phaseLines).toHaveLength(6);
  });

  it("never leaks the shop CNC term — uses client-friendly labels", () => {
    const { phaseLines, fullText } = buildKickoffArtifact(baseInput);
    const cncLine = phaseLines.find((p) => p.phase === "cnc");
    expect(cncLine?.label).not.toMatch(/CNC/);
    // fullText phase lines should not contain bare "CNC" either.
    expect(fullText).not.toMatch(/\bCNC\b/);
  });

  it("install phase window is the firm ISO date, not a week range", () => {
    const { phaseLines } = buildKickoffArtifact(baseInput);
    const install = phaseLines.find((p) => p.phase === "install")!;
    expect(install.window).toBe(INSTALL_DATE);
    expect(install.window).not.toMatch(/Week of/);
  });

  it("mid-phases with targets show soft week windows", () => {
    const { phaseLines } = buildKickoffArtifact(baseInput);
    const design = phaseLines.find((p) => p.phase === "design")!;
    expect(design.window).toMatch(/^Week of /);
  });

  it("mid-phases without targets show 'To be scheduled'", () => {
    const { phaseLines } = buildKickoffArtifact(baseInput);
    const finishing = phaseLines.find((p) => p.phase === "finishing")!;
    expect(finishing.window).toBe("To be scheduled");
  });

  it("includes the two base update-protocol items when no portal URL is given", () => {
    const { updateProtocol } = buildKickoffArtifact(baseInput);
    expect(updateProtocol).toHaveLength(BASE_UPDATE_PROTOCOL.length);
    expect(updateProtocol[0]).toMatch(/phase.*complete/i);
    expect(updateProtocol[1]).toMatch(/install date.*change/i);
  });

  it("adds a third protocol item + portalLine when a portal URL is provided", () => {
    const withPortal = buildKickoffArtifact({
      ...baseInput,
      portalUrl: "https://example.com/s/abc123",
    });
    expect(withPortal.updateProtocol).toHaveLength(BASE_UPDATE_PROTOCOL.length + 1);
    expect(withPortal.portalLine).toContain("https://example.com/s/abc123");
  });

  it("omits the portal protocol item and portalLine when no URL is given", () => {
    const { updateProtocol, portalLine } = buildKickoffArtifact(baseInput);
    expect(updateProtocol).toHaveLength(BASE_UPDATE_PROTOCOL.length);
    expect(portalLine).toBeNull();
  });

  it("includes a client greeting when clientName is provided", () => {
    const { fullText } = buildKickoffArtifact(baseInput);
    expect(fullText).toContain("Hi Jane Saywell");
  });

  it("falls back to a generic greeting when clientName is null", () => {
    const { fullText } = buildKickoffArtifact({ ...baseInput, clientName: null });
    expect(fullText).toContain("Hi,");
    expect(fullText).not.toContain("Hi null");
  });

  it("fullText is copy-ready: contains the job name, all phase labels, and the sign-off", () => {
    const { fullText } = buildKickoffArtifact(baseInput);
    expect(fullText).toContain("Saywell Kitchen");
    expect(fullText).toContain("Design & drawings");
    expect(fullText).toContain("Installation");
    expect(fullText).toContain("Good Woods");
  });

  it("never exposes buffer, internal targets, or fever keywords", () => {
    const { fullText } = buildKickoffArtifact(baseInput);
    expect(fullText.toLowerCase()).not.toContain("buffer");
    expect(fullText.toLowerCase()).not.toContain("internal target");
    expect(fullText.toLowerCase()).not.toContain("fever");
  });
});
