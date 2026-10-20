import { type CSSProperties, Fragment } from "react";
import { getLocale } from "next-intl/server";
import { type AppLocale, directionOf } from "@/i18n/routing";
import { martianMono, readexPro } from "@/styles/fonts";
import { COPY, DIGITS, HEXP_VALUES, JOINED_AR, STEPS } from "./copy";
import { TypeChecks } from "./type-checks";
import { C } from "./classes";

// Spike T-11: Readex Pro and Martian Mono through next/font (DESIGN §3.3, NFR-PERF-08). The type
// scale in this page's language, then fixtures in both scripts that type-checks.tsx measures. T-13
// turns the scale into tokens.

const SCRIPTS: AppLocale[] = ["ar", "en"];

const sampleClass = { display: C.display, head: C.head, lead: C.lead, body: C.body, small: C.small };

function DigitRow({ id, numeric, className, style }: { id: string; numeric: "normal" | "tabular-nums"; className?: string | undefined; style: CSSProperties }) {
  return (
    <div className={C.row}>
      <span className={C.rowLabel} lang="en" dir="ltr">
        {id} · {numeric}
      </span>
      <span dir="ltr" className={`${C.sample} ${className ?? ""}`} style={{ ...style, fontVariantNumeric: numeric }} data-digits={id} data-numeric={numeric}>
        {DIGITS.map((digit) => (
          <span key={digit} className={C.digit} data-digit={digit}>
            {digit}
          </span>
        ))}
      </span>
    </div>
  );
}

export default async function TypeSpikePage() {
  const locale = await getLocale();
  const copy = COPY[locale];
  const other: AppLocale = locale === "ar" ? "en" : "ar";

  return (
    <main className={C.page}>
      <div className={C.frame}>
        <header className={C.chrome}>
          <h1 lang="en" dir="ltr">
            Muftah dev: fonts and type scale (T-11)
          </h1>
          <a className={C.link} href={`/${other}/dev/type`} lang={other} dir={directionOf(other)}>
            {other === "ar" ? "العربية" : "English"}
          </a>
        </header>

        <section className={C.section} aria-labelledby="scale">
          <h2 id="scale" className={C.sectionTitle} lang="en" dir="ltr">
            Type scale, DESIGN §3.3
          </h2>
          {STEPS.map((step) => (
            <div key={step.id} className={C.step}>
              <p className={C.label} lang="en" dir="ltr">
                <b className={C.labelName}>{step.id}</b>
                {step.spec}
              </p>
              <div className={C.slot} data-slot>
                <p className={sampleClass[step.id]} data-sample={step.id}>
                  {step.id === "display" ? (
                    <>
                      {copy.display.name} <bdi>{copy.display.trim}</bdi>
                    </>
                  ) : (
                    copy[step.id]
                  )}
                </p>
              </div>
            </div>
          ))}
        </section>

        <section className={C.section} aria-labelledby="figures">
          <h2 id="figures" className={C.sectionTitle} lang="en" dir="ltr">
            Figures: Martian Mono at wdth 87.5, wght 450, tabular-nums, with the units outside it
          </h2>
          <div className={C.step}>
            <p className={C.label} lang="en" dir="ltr">
              <b className={C.labelName}>figures</b>at the body step, with the labels in Readex Pro
            </p>
            <div className={C.slot} data-slot>
              <dl className={`${C.facts} ${C.body}`} data-sample="figures" data-figures>
                {copy.figures.map((figure) => (
                  <Fragment key={figure.label}>
                    <dt className={C.factTerm}>{figure.label}</dt>
                    <dd className={C.factValue}>
                      <span className={C.figure} dir="ltr" data-figure>
                        {figure.value}
                      </span>
                      {figure.unit ? ` ${figure.unit}` : null}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            </div>
          </div>
        </section>

        <section className={C.section} aria-labelledby="checks">
          <h2 id="checks" className={C.sectionTitle} lang="en" dir="ltr">
            Fixtures in both scripts, measured under Results
          </h2>
          <div className={C.checks}>
            <div className={C.fixture}>
              <p className={C.label} lang="en" dir="ltr">
                <b className={C.labelName}>HEXP</b>0, 50 and 100: the wordmark at wght 600, the tagline at wght 400
              </p>
              <div className={C.rows}>
                {[600, 400].map((wght) =>
                  SCRIPTS.map((script) =>
                    HEXP_VALUES.map((hexp) => (
                      <div key={`${wght}-${script}-${hexp}`} className={C.row}>
                        <span className={C.rowLabel} lang="en" dir="ltr">
                          {script} · {wght} · HEXP {hexp}
                        </span>
                        <span
                          lang={script}
                          dir={directionOf(script)}
                          className={C.sample}
                          style={{ fontSize: wght === 600 ? "2.5rem" : "1.25rem", fontWeight: wght, fontVariationSettings: `"HEXP" ${hexp}` }}
                          data-hexp={hexp}
                          data-script={script}
                          data-wght={wght}
                        >
                          {wght === 600 ? COPY[script].wordmark : COPY[script].lead}
                        </span>
                      </div>
                    )),
                  ),
                )}
              </div>
            </div>

            <div className={C.fixture}>
              <p className={C.label} lang="en" dir="ltr">
                <b className={C.labelName}>joins</b>a fully joined word at HEXP 0 and 100, wght 600: every letter should stay connected
              </p>
              <div className={C.rows}>
                {[0, 100].map((hexp) => (
                  <div key={hexp} className={C.row}>
                    <span className={C.rowLabel} lang="en" dir="ltr">ar · 600 · HEXP {hexp}</span>
                    <span
                      lang="ar"
                      dir="rtl"
                      className={C.sample}
                      style={{ fontSize: "6rem", fontWeight: 600, lineHeight: 1.25, fontVariationSettings: `"HEXP" ${hexp}` }}
                      data-join={hexp}
                    >
                      {JOINED_AR}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={C.fixture}>
              <p className={C.label} lang="en" dir="ltr">
                <b className={C.labelName}>digits</b>each digit boxed by its advance: Readex Pro at 18 and 64 px, Martian Mono at wdth 100 and 87.5
              </p>
              <div className={C.rows}>
                <DigitRow id="readex-body" numeric="normal" style={{ fontSize: "1.125rem" }} />
                <DigitRow id="readex-body" numeric="tabular-nums" style={{ fontSize: "1.125rem" }} />
                <DigitRow id="readex-display" numeric="normal" style={{ fontSize: "4rem", fontWeight: 600, lineHeight: 1.25 }} />
                <DigitRow id="readex-display" numeric="tabular-nums" style={{ fontSize: "4rem", fontWeight: 600, lineHeight: 1.25 }} />
                <DigitRow id="martian-875" numeric="tabular-nums" className={C.figure} style={{ fontSize: "1.125rem" }} />
                <div className={C.row}>
                  <span className={C.rowLabel} lang="en" dir="ltr">martian · wdth</span>
                  <span dir="ltr" className={`${C.sample} ${C.figure}`} style={{ fontSize: "1.125rem", fontStretch: "100%" }} data-stretch="100">
                    4T1B31HK3KU190069
                  </span>
                </div>
                <div className={C.row}>
                  <span className={C.rowLabel} lang="en" dir="ltr">martian · wdth 87.5</span>
                  <span dir="ltr" className={`${C.sample} ${C.figure}`} style={{ fontSize: "1.125rem" }} data-stretch="87.5">
                    4T1B31HK3KU190069
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <TypeChecks families={{ readex: readexPro.style.fontFamily, martian: martianMono.style.fontFamily }} />
      </div>
    </main>
  );
}
