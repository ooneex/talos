import { CURRENCIES } from "@talosjs/currencies";
import { Assert, createConstraint } from "../utils";

const VALID_CURRENCY_CODES: string[] = CURRENCIES.map((currency) => currency.code);

const AssertCurrencyBase: ReturnType<typeof createConstraint> = createConstraint(
  () => Assert(`"${VALID_CURRENCY_CODES.join('" | "')}" & /^[A-Z]{3}$/`),
  "Currency code must be a valid ISO 4217 currency code (3 uppercase letters)",
);

export class AssertCurrency extends AssertCurrencyBase {}
