import { TEST_CODES } from "../codes";

// The VIN scan fixtures, large, to scan off this screen with a phone (BUILD-PLAN §4). Each code has
// a screen of its own, so only one is in the camera's band at a time.
export default function VinCodesPage() {
  return (
    <main className="grid gap-6 bg-white p-6 font-mono text-sm text-black">
      <h1 className="text-lg">Muftah dev: VIN test codes (T-10)</h1>
      <ol className="grid gap-1">
        {TEST_CODES.map((code) => (
          <li key={code.id}>
            <a className="underline" href={`#${code.id}`}>
              {code.label}
            </a>
          </li>
        ))}
      </ol>
      {TEST_CODES.map((code) => (
        <section key={code.id} id={code.id} className="grid min-h-svh content-center justify-items-center gap-4" data-code={code.id}>
          <svg
            viewBox={`0 0 ${code.width} ${code.height}`}
            className={code.format === "code_39" || code.format === "code_128" ? "w-full max-w-4xl" : "w-72"}
            shapeRendering="crispEdges"
            role="img"
            aria-label={code.label}
          >
            <rect width={code.width} height={code.height} fill="#fff" />
            <path d={code.path} fill="#000" />
          </svg>
          <p>{code.label}</p>
          <p>{code.vin ? `Fills ${code.vin}` : "Fills nothing"}</p>
        </section>
      ))}
    </main>
  );
}
