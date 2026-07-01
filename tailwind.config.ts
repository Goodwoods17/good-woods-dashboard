import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./features/**/*.{js,ts,jsx,tsx,mdx}",
    "./shared/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        "canvas-top": "var(--canvas-top)",
        "canvas-foot-tint": "var(--canvas-foot-tint)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
          sunken: "var(--surface-sunken)",
        },
        border: {
          DEFAULT: "var(--border)",
          faint: "var(--border-faint)",
          strong: "var(--border-strong)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          tertiary: "var(--text-tertiary)",
          disabled: "var(--text-disabled)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
          active: "var(--accent-active)",
          soft: "var(--accent-soft)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          hover: "var(--secondary-hover)",
          soft: "var(--secondary-soft)",
        },
        "ink-pill": "var(--ink-pill)",
        status: {
          "on-track": "var(--status-on-track)",
          "at-risk": "var(--status-at-risk)",
          blocked: "var(--status-blocked)",
          complete: "var(--status-complete)",
          paused: "var(--status-paused)",
          andon: "var(--status-andon)",
          "on-track-soft": "var(--status-on-track-soft)",
          "at-risk-soft": "var(--status-at-risk-soft)",
          "blocked-soft": "var(--status-blocked-soft)",
          "andon-soft": "var(--status-andon-soft)",
        },
      },
      borderColor: {
        // Translucent ink hairline for card edges, dividers, and section
        // rules. Unlike the opaque `border`/`border-faint` tokens it tints
        // whatever sits behind it, so it reads consistently over muted and
        // sunken fills. Also available as `divide-hairline`.
        hairline: "rgba(26, 25, 22, 0.05)",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "-apple-system", "sans-serif"],
        serif: ["var(--font-cormorant)", "Tiempos Headline", "Georgia", "serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        md: ["15px", { lineHeight: "24px" }],
        lg: ["17px", { lineHeight: "26px" }],
        xl: ["20px", { lineHeight: "28px", letterSpacing: "-0.02em" }],
        "2xl": ["24px", { lineHeight: "32px", letterSpacing: "-0.02em" }],
        "3xl": ["30px", { lineHeight: "38px", letterSpacing: "-0.02em" }],
        "4xl": ["40px", { lineHeight: "48px", letterSpacing: "-0.02em" }],
        // Named typography tokens per DESIGN.md §3
        greeting: ["38px", { lineHeight: "44px", letterSpacing: "-0.02em" }],
        headline: ["24px", { lineHeight: "30px", letterSpacing: "-0.02em" }],
        title: ["18px", { lineHeight: "24px", letterSpacing: "-0.01em" }],
        "body-emphasis": ["14px", { lineHeight: "22px", letterSpacing: "-0.005em" }],
        body: ["14px", { lineHeight: "22px", letterSpacing: "-0.01em" }],
        secondary: ["13px", { lineHeight: "20px", letterSpacing: "-0.005em" }],
        caption: ["12px", { lineHeight: "16px", letterSpacing: "-0.005em" }],
        label: ["11px", { lineHeight: "16px", letterSpacing: "0.06em" }],
        micro: ["10px", { lineHeight: "14px", letterSpacing: "0" }],
        mono: ["13px", { lineHeight: "20px", letterSpacing: "0" }],
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "14px",
        "2xl": "16px",
        pill: "9999px",
      },
      boxShadow: {
        resting: "var(--shadow-resting)",
        hover: "var(--shadow-hover)",
        floating: "var(--shadow-floating)",
        modal: "var(--shadow-modal)",
        // Legacy aliases so existing code keeps building while we migrate.
        sm: "var(--shadow-resting)",
        md: "var(--shadow-floating)",
        lg: "var(--shadow-modal)",
      },
      transitionTimingFunction: {
        standard: "var(--ease-standard)",
        emphasized: "var(--ease-emphasized)",
      },
      transitionDuration: {
        fast: "120ms",
        base: "200ms",
        slow: "320ms",
      },
      screens: {
        sm: "640px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
        tv: "1920px",
      },
    },
  },
  plugins: [],
};
export default config;
