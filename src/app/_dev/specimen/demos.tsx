"use client";

import {
  ArrowClockwiseIcon,
  CalendarBlankIcon,
  FloppyDiskIcon,
  FunnelIcon,
  FunnelSimpleIcon,
  ShareNetworkIcon,
} from "@phosphor-icons/react/ssr";
import { type ComponentProps, type ReactNode, useState } from "react";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { InlineError } from "@/components/ui/inline-error";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { showToast } from "@/components/ui/toaster";
import { Caption } from "./caption";
import type { SpecimenCopy } from "./copy";

// The base controls on the tokens (T-13), in each state DESIGN §6.4 gives them. The toasts show in
// the Toaster each root layout mounts.

/** A VIN whose check digit matches, and the same VIN with its 9th character changed */
const VIN = { valid: "1HGCV3F18JA518032", mismatch: "1HGCV3F19JA518032" };

export function Demos({ copy }: { copy: SpecimenCopy }) {
  return (
    <div className="grid gap-12">
      <Demo name="Button">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" icon={<CalendarBlankIcon />}>
            {copy.primary}
          </Button>
          <Button>{copy.secondary}</Button>
          <Button variant="quiet">{copy.quiet}</Button>
          <Button icon={<ShareNetworkIcon />}>{copy.share}</Button>
          <Button size="icon" aria-label={copy.share}>
            <ShareNetworkIcon />
          </Button>
          <Button disabled>{copy.sold}</Button>
          <Button variant="primary" icon={<FloppyDiskIcon />} loading>
            {copy.saving}
          </Button>
        </div>
      </Demo>

      <Demo name="Field and Input: hint, error, valid">
        <div className="grid max-w-measure gap-6">
          <Field label={copy.vin} description={copy.vinHint} dir="ltr">
            <VinInput />
          </Field>
          <Field label={copy.vin} description={copy.vinHint} error={copy.vinError} dir="ltr">
            <VinInput defaultValue={VIN.mismatch} />
          </Field>
          <Field label={copy.vin} valid={copy.vinValid} dir="ltr">
            <VinInput defaultValue={VIN.valid} />
          </Field>
        </div>
      </Demo>

      <Demo name="Skeleton">
        <div aria-busy="true" className="grid w-64 gap-3">
          <Skeleton className="aspect-card" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Demo>

      <Demo name="EmptyState">
        <EmptyState icon={<FunnelSimpleIcon />} action={<Button>{copy.clearFilters}</Button>}>
          {copy.empty}
        </EmptyState>
      </Demo>

      <Demo name="InlineError">
        <InlineError blocking={false} retry={<Button icon={<ArrowClockwiseIcon />}>{copy.tryAgain}</Button>}>
          {copy.loadError}
        </InlineError>
      </Demo>

      <Demo name="Toaster">
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => showToast(copy.copied)}>{copy.showToast}</Button>
          <Button
            onClick={() =>
              showToast(copy.draftFailed, {
                action: { label: copy.retry, onClick: () => showToast(copy.draftSaved) },
              })
            }
          >
            {copy.showRetryToast}
          </Button>
        </div>
      </Demo>

      <Demo name="BottomSheet">
        <SheetDemo copy={copy} />
      </Demo>
    </div>
  );
}

function Demo({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="grid gap-4" data-demo={name}>
      <Caption>{name}</Caption>
      {children}
    </div>
  );
}

/** A VIN is typed as it is printed, with no correction or capitals added; its Field sets it left to right */
function VinInput(props: ComponentProps<typeof Input>) {
  return <Input autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false} {...props} />;
}

/** The filter sheet's shape (DESIGN §6.1 wireframe): facets with counts, and the result count pinned */
function SheetDemo({ copy }: { copy: SpecimenCopy }) {
  const [open, setOpen] = useState(false);

  return (
    <BottomSheet
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button icon={<FunnelIcon />} className="justify-self-start">
          {copy.filters}
        </Button>
      }
      title={copy.filters}
      closeLabel={copy.close}
      footer={
        <Button variant="primary" className="w-full" onClick={() => setOpen(false)}>
          {copy.showCars}
        </Button>
      }
    >
      <ul>
        {copy.makes.map((make) => (
          <li key={make.name} className="flex h-12 items-center justify-between gap-4">
            {make.name}
            <span className="figures text-muted">{make.count}</span>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}
