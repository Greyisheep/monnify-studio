/**
 * Template picker copy + options — Figma jj9fKZamdwfNDVD5rGQI9G
 * `#144:4304` / `#155:4959` (OQ-1: unique Ajo description).
 */

export const TEMPLATE_PICKER_TITLE = "What do you want to do?";

export const TEMPLATE_PICKER_SUBTITLE =
  "Pick a vetted product template. Safety nodes come built in.";

export const TEMPLATE_PICKER_SELECT_LABEL = "Select";
export const TEMPLATE_PICKER_SELECT_BUSY_LABEL = "Opening…";
export const TEMPLATE_PICKER_BACK_LABEL = "Back";

export type TemplatePickerOption = {
  id: string;
  title: string;
  description: string;
  image: string | null;
  kind: "template" | "other";
};

export const TEMPLATE_PICKER_OPTIONS: TemplatePickerOption[] = [
  {
    id: "sell-online",
    title: "Sell goods & services",
    description: "Setup a payment link and a dashboard for your orders",
    image: "/figma/templates/template-sell-goods.png",
    kind: "template",
  },
  {
    id: "ajo",
    title: "Start a savings group (Ajo)",
    description: "Collect member contributions and track the rotating pool",
    image: "/figma/templates/template-ajo.png",
    kind: "template",
  },
  {
    id: "invoice",
    title: "Send an invoice",
    description: "Create invoices to share to customers",
    image: "/figma/templates/template-send-invoice.png",
    kind: "template",
  },
  {
    id: "__other__",
    title: "Something else",
    description: "Describe what you want and let Moni build it",
    image: null,
    kind: "other",
  },
];
