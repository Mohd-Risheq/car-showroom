// How long a sign-in lasts (SEC-01), apart from auth.ts, which loads the database, so the privacy
// page's test can hold what the page states to it

const DAY_SECONDS = 60 * 60 * 24;

/** A sign-in ends 7 days after it began or was last extended: it slides (SEC-01) */
export const SESSION_EXPIRES_SECONDS = 7 * DAY_SECONDS;
/** A sign-in in use is extended at most once a day */
export const SESSION_UPDATE_AGE_SECONDS = DAY_SECONDS;
