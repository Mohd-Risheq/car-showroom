import type { ComponentProps } from "react";

// A stored photo, whose widths the browser picks from (BR-20): a plain img, as the site has no
// image optimizer (SRS §11.2), so next/image would bring its code to the page for nothing (D-049).
// Its width and height hold its place while it loads, and it decodes off the main thread. It sits
// in a picture element, which takes no box of its own, so React writes no preload for an eager
// photo: a phone picked a wider file for that preload than for the img, and downloaded the photo
// twice.

type PhotoProps = Omit<ComponentProps<"img">, "src" | "srcSet" | "alt" | "width" | "height"> & {
  /** The narrowest file, and every width (srcset.ts), or the one file shown, as a zoomed photo's */
  src: string;
  srcSet?: string;
  /**
   * Always written, empty only for a photo that says nothing its link doesn't (FR-10.6), or the
   * photo under it, as a zoomed photo's largest file
   */
  alt: string;
  width: number;
  height: number;
};

export function Photo({ src, srcSet, sizes, alt, ...props }: PhotoProps) {
  return (
    <picture className="contents">
      <img decoding="async" src={src} srcSet={srcSet} sizes={sizes} alt={alt} {...props} />
    </picture>
  );
}
