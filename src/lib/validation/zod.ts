import { z } from "zod";

// Every schema of the app is built with this z (SEC-13). Without the setting, Zod checks whether
// it may compile a parser with new Function when the first object schema is built, and compiles
// one at the first parse. A Content Security Policy without unsafe-eval reports each attempt,
// though Zod catches the failure (SRS §12.5). The setting covers the schemas built after it, so
// src takes z from this module alone (ESLint).
z.config({ jitless: true });

export { z };
