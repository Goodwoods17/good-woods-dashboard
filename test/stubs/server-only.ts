// Vitest stub for the `server-only` package (ADR 0022). The real package throws
// unconditionally on import outside a React Server Component (its purpose is to
// make an accidental client import a BUILD error). Vitest runs in a plain node
// environment with no react-server condition, so importing any `*Server` module
// that now carries `import "server-only"` would otherwise throw at import time.
// This empty module is aliased in for tests only — production builds resolve the
// real package, preserving the client-import guard.
export {};
