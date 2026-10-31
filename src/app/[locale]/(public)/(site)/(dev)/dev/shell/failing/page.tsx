import type { Metadata } from "next";
import { notFoundOnDeployments } from "@/lib/deployment";
import { FailingPart } from "./failing-part";

// T-19: a page whose content fails (SRS §13.3, DESIGN §7.2.11), for tests/e2e/shell.spec.ts: the
// segment error shows in its place, inside the shell, until Try again renders it once more

export const metadata: Metadata = { title: "Muftah dev: failing" };

export default function FailingDevPage() {
  notFoundOnDeployments();
  return (
    <div className="mx-auto flex max-w-content flex-col gap-4 px-band py-12">
      <h1 className="type-head">Failing page</h1>
      <FailingPart />
    </div>
  );
}
