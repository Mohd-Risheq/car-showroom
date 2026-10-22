// pnpm check:seed (05-SEED-DATA §10): every check on the seed data, with the media budgets of §3.6.
// T-17 writes the checks with the seed itself. Until then the command fails, so nothing reads as
// checked before there is anything to check.
console.error("check:seed: no seed checks yet; T-17 writes them with the seed data (05-SEED-DATA §10)");
process.exitCode = 1;
