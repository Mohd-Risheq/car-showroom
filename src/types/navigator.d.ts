// Global Privacy Control (FR-47.3), which TypeScript's DOM types don't have yet: true where the
// visitor has asked sites not to sell or share their data
interface Navigator {
  readonly globalPrivacyControl?: boolean;
}
