import { askName } from "./askName";
import { prompt } from "./prompt";

const CREATE_NEW = "Create a new design";

// Let the user pick one of the existing design modules or opt to scaffold a new one.
// Returns the chosen (or freshly entered) design name.
export const askDesign = async (config: { existing: string[] }): Promise<string> => {
  if (config.existing.length === 0) {
    return askName({ message: "Enter design name" });
  }

  const response = await prompt<{ design: string }>({
    type: "select",
    name: "design",
    message: "Choose a design module",
    choices: [...config.existing, CREATE_NEW],
  });

  if (response.design === CREATE_NEW) {
    return askName({ message: "Enter design name" });
  }

  return response.design;
};
