import type { AppLocale } from "@/lib/i18n/routing";
import type { TypeStep } from "@/styles/type-scale";

// The words of the token specimens (T-13), in both locales. Development pages only: shipped copy
// comes from the catalogs (T-14). Each type step shows the kind of text it sets, from the DESIGN §9.2
// copy deck and the S01 seed record (05-SEED-DATA §5.4): the display step sets model names.

/** A sample for each of DESIGN §3.3's public steps */
export type StepSamples = Record<TypeStep, string>;

export type SpecimenCopy = {
  steps: StepSamples;
  primary: string;
  secondary: string;
  quiet: string;
  share: string;
  saving: string;
  sold: string;
  close: string;
  vin: string;
  vinHint: string;
  vinError: string;
  vinValid: string;
  empty: string;
  clearFilters: string;
  loadError: string;
  tryAgain: string;
  showToast: string;
  showRetryToast: string;
  copied: string;
  draftFailed: string;
  draftSaved: string;
  retry: string;
  filters: string;
  showCars: string;
  makes: ReadonlyArray<{ name: string; count: number }>;
  theme: string;
  daylight: string;
  dark: string;
  /** The unit of a blueprint dimension line's label */
  millimetres: string;
  move: string;
};

export const SPECIMEN_COPY = {
  ar: {
    steps: {
      display: "لاندكروزر GXR",
      head: "كيف نوثّق كل سيارة",
      lead: "شوف الفحص قبل ما تشوف السيارة",
      body: "جميع القطع المعدنية دهان وكالة، وعلى زاوية الصدام الخلفي رشة تجميلية.",
      small: "هذه المعلومات مقدّمة من المعرض، وننصح بإجراء فحص مستقل قبل الشراء.",
    },
    primary: "احجز موعد معاينة",
    secondary: "قارن",
    quiet: "لاحقاً",
    share: "شارك",
    saving: "جارٍ الحفظ",
    sold: "مباعة",
    close: "إغلاق",
    vin: "رقم الهيكل (الشاصي)",
    vinHint: "17 حرفاً ورقماً، على الزجاج الأمامي أو إطار الباب",
    vinError: "خانة التحقق لا تطابق. راجع الخانة التاسعة.",
    vinValid: "خانة التحقق مطابقة.",
    empty: "لا توجد سيارات تطابق هذه الفلاتر.",
    clearFilters: "امسح الفلاتر",
    loadError: "ما قدرنا نحمّل الفحص. تأكد من الاتصال وحاول مرة ثانية.",
    tryAgain: "حاول مرة ثانية",
    showToast: "اعرض إشعاراً",
    showRetryToast: "اعرض إشعاراً فيه إعادة محاولة",
    copied: "تم نسخ الرابط",
    draftFailed: "ما انحفظت المسودة.",
    draftSaved: "انحفظت المسودة.",
    retry: "أعد المحاولة",
    filters: "الفلاتر",
    showCars: "اعرض 18 سيارة",
    makes: [
      { name: "تويوتا", count: 9 },
      { name: "هيونداي", count: 7 },
      { name: "كيا", count: 6 },
      { name: "مرسيدس بنز", count: 4 },
      { name: "بي إم دبليو", count: 3 },
      { name: "نيسان", count: 5 },
      { name: "ميتسوبيشي", count: 2 },
      { name: "هوندا", count: 3 },
      { name: "فورد", count: 2 },
      { name: "شيفروليه", count: 1 },
      { name: "لكزس", count: 2 },
      { name: "فولكس فاغن", count: 1 },
    ],
    theme: "المظهر",
    daylight: "النهار",
    dark: "الداكن",
    millimetres: "ملم",
    move: "حرّك",
  },
  en: {
    steps: {
      display: "Land Cruiser GXR",
      head: "How every car is documented",
      lead: "See the inspection before you see the car.",
      body: "Every metal panel is in factory paint, and the rear bumper corner has a cosmetic touch-up.",
      small: "This information is declared by the dealer. We recommend an independent inspection before you buy.",
    },
    primary: "Book a viewing",
    secondary: "Compare",
    quiet: "Not now",
    share: "Share",
    saving: "Saving",
    sold: "Sold",
    close: "Close",
    vin: "VIN",
    vinHint: "17 letters and digits, on the windscreen or the door frame",
    vinError: "The check digit doesn't match. Check the 9th character.",
    vinValid: "The check digit matches.",
    empty: "No cars match these filters.",
    clearFilters: "Clear filters",
    loadError: "We couldn't load the inspection. Check your connection and try again.",
    tryAgain: "Try again",
    showToast: "Show a toast",
    showRetryToast: "Show a toast with a retry",
    copied: "Link copied",
    draftFailed: "The draft wasn't saved.",
    draftSaved: "The draft is saved.",
    retry: "Retry",
    filters: "Filters",
    showCars: "Show 18 cars",
    makes: [
      { name: "Toyota", count: 9 },
      { name: "Hyundai", count: 7 },
      { name: "Kia", count: 6 },
      { name: "Mercedes-Benz", count: 4 },
      { name: "BMW", count: 3 },
      { name: "Nissan", count: 5 },
      { name: "Mitsubishi", count: 2 },
      { name: "Honda", count: 3 },
      { name: "Ford", count: 2 },
      { name: "Chevrolet", count: 1 },
      { name: "Lexus", count: 2 },
      { name: "Volkswagen", count: 1 },
    ],
    theme: "Theme",
    daylight: "Daylight",
    dark: "Dark",
    millimetres: "mm",
    move: "Move",
  },
} as const satisfies Record<AppLocale, SpecimenCopy>;
