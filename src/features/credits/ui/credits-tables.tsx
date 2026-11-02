import { Fragment, type ReactNode } from "react";
import { DataTable } from "@/components/ui/data-table";
import { ReadingHeading } from "@/components/ui/reading-heading";
import { cn } from "@/lib/class-names";
import { isolate } from "@/lib/i18n/bidi";
import type {
  Address,
  ChangeKey,
  CreditsData,
  LicenceCell,
  LicenceKey,
  Linked,
  Recording,
  SiteKey,
  SoftwareEntry,
  WorkRow,
} from "../domain/credits";

// SCR-14's Credits page's tables (DESIGN §7.2.9), in the page's order, each under its h2 and left
// out with it while it has no rows. A name, title, author or address is as its source gives it, so
// each keeps its own direction inside Arabic text (FR-01.8).

type TableKey =
  | `credits.${"photos" | "sounds" | "data" | "fonts" | "software" | "within"}`
  | `credits.col.${"source" | "author" | "licence" | "link" | "recording" | "changes"}`
  | "dashboard.col.car"
  | "sound.sameEngine"
  | SiteKey
  | LicenceKey
  | ChangeKey;

/** The catalog's messages, as next-intl's getTranslations() gives them */
export type Translate = (key: TableKey, values?: Record<string, string>) => string;

type CreditsTablesProps = { tables: CreditsData; t: Translate };

// Underlined, as a cell beside a link may hold plain text, and in the text's own colour, as a page
// of links in --scan would break its 5% (DESIGN §3.1)
const LINK = "underline decoration-meta underline-offset-4 hover:decoration-ink";

/**
 * An address may break after each slash, as it has no spaces to wrap at: whole, the longest would
 * squeeze the table's other columns
 */
function AddressText({ address }: { address: string }) {
  return (
    <bdi>
      {address.split("/").map((part, index) => (
        <Fragment key={index}>
          {index === 0 ? null : (
            <>
              /<wbr />
            </>
          )}
          {part}
        </Fragment>
      ))}
    </bdi>
  );
}

/** A value from a source, linked where it has an address */
function Value(props: Linked | Address) {
  const { href } = props;
  const value = "address" in props ? <AddressText address={props.address} /> : <bdi>{props.text}</bdi>;
  return href === null ? (
    value
  ) : (
    <a href={href} className={LINK}>
      {value}
    </a>
  );
}

/** A licence's name, on one line: "SIL OFL 1.1" split in a narrow column reads as two names */
function Licence({ cell: { key, href }, t }: { cell: LicenceCell; t: Translate }) {
  return href === null ? (
    <span className="whitespace-nowrap">{t(key)}</span>
  ) : (
    <a href={href} className={cn(LINK, "whitespace-nowrap")}>
      {t(key)}
    </a>
  );
}

/** What was done to a file, one change to a line, as a change that wrapped would read as two */
function Changes({ changes, t }: { changes: readonly ChangeKey[]; t: Translate }) {
  return (
    <ul>
      {changes.map((change) => (
        <li key={change} className="whitespace-nowrap">
          {t(change)}
        </li>
      ))}
    </ul>
  );
}

function recordingOf(recording: Recording, t: Translate): ReactNode {
  if (recording === null) return null;
  return "key" in recording ? t(recording.key) : recording.text;
}

const workRow = ({ name, author, licence, link }: WorkRow, t: Translate): ReactNode[] => [
  <bdi key="name">{name}</bdi>,
  <bdi key="author">{author}</bdi>,
  <Licence key="licence" cell={licence} t={t} />,
  <Value key="link" {...link} />,
];

/** A package's name and version, and what bundles it */
function SoftwareName({ entry: { name, version, within }, t }: { entry: SoftwareEntry; t: Translate }) {
  return (
    <>
      <bdi>{name}</bdi>
      {version === null ? null : (
        <>
          {" "}
          <bdi className="font-normal text-muted">{version}</bdi>
        </>
      )}
      {/* The space parts the lines for a screen reader, which may join a block's text to the line before */}
      {within === null ? null : (
        <>
          {" "}
          <span className="block font-normal text-meta">{t("credits.within", { name: isolate(within) })}</span>
        </>
      )}
    </>
  );
}

export function CreditsTables({ tables, t }: CreditsTablesProps) {
  const fileColumns = [t("credits.col.source"), t("credits.col.author"), t("credits.col.licence")];
  const sections = [
    {
      key: "photos",
      title: t("credits.photos"),
      head: [t("dashboard.col.car"), ...fileColumns, t("credits.col.link"), t("credits.col.changes")],
      rows: tables.photos.map((row) => [
        row.car,
        t(row.site),
        <Value key="author" {...row.author} />,
        <Licence key="licence" cell={row.licence} t={t} />,
        row.original === null ? null : <Value key="original" {...row.original} />,
        <Changes key="changes" changes={row.changes} t={t} />,
      ]),
    },
    {
      key: "sounds",
      title: t("credits.sounds"),
      head: [
        t("dashboard.col.car"),
        t("credits.col.recording"),
        ...fileColumns,
        t("credits.col.link"),
        t("credits.col.changes"),
      ],
      rows: tables.sounds.map((row) => [
        row.car,
        recordingOf(row.recording, t),
        t(row.site),
        <Value key="author" {...row.author} />,
        <Licence key="licence" cell={row.licence} t={t} />,
        row.original === null ? null : <Value key="original" {...row.original} />,
        <Changes key="changes" changes={row.changes} t={t} />,
      ]),
    },
    {
      key: "data",
      title: t("credits.data"),
      head: [...fileColumns, t("credits.col.link")],
      rows: tables.data.map((row) => workRow(row, t)),
    },
    {
      key: "fonts",
      title: t("credits.fonts"),
      head: [...fileColumns, t("credits.col.link")],
      rows: tables.fonts.map((row) => workRow(row, t)),
    },
    {
      key: "software",
      title: t("credits.software"),
      head: [t("credits.col.source"), t("credits.col.licence"), t("credits.col.link")],
      rows: tables.software.map((entry) => [
        <SoftwareName key="name" entry={entry} t={t} />,
        <Licence key="licence" cell={entry.licence} t={t} />,
        <Value key="source" {...entry.source} />,
      ]),
    },
  ];
  return sections
    .filter(({ rows }) => rows.length > 0)
    .map(({ key, title, head, rows }) => (
      <Fragment key={key}>
        <ReadingHeading>{title}</ReadingHeading>
        <DataTable label={title} head={head} rows={rows} />
      </Fragment>
    ));
}
