const sleep = (ms: number): Promise<number> =>
  new Promise((resolve) => setTimeout(resolve.bind(null, ms), ms));

export function convertToDateString(input: string): string {
  // Define the regular expression pattern to match the input string
  const pattern = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago$/i;
  const match = input.match(pattern);

  if (!match) {
    throw new Error(`Invalid input format for ${input}`);
  }

  const quantity = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const currentDate = new Date();

  switch (unit) {
    case "second":
      currentDate.setSeconds(currentDate.getSeconds() - quantity);
      break;
    case "minute":
      currentDate.setMinutes(currentDate.getMinutes() - quantity);
      break;
    case "hour":
      currentDate.setHours(currentDate.getHours() - quantity);
      break;
    case "day":
      currentDate.setDate(currentDate.getDate() - quantity);
      break;
    case "week":
      currentDate.setDate(currentDate.getDate() - (quantity * 7));
      break;
    case "month":
      currentDate.setMonth(currentDate.getMonth() - quantity);
      break;
    case "year":
      currentDate.setFullYear(currentDate.getFullYear() - quantity);
      break;
    default:
      throw new Error(`Invalid unit ${unit}`);
  }

  const year = currentDate.getFullYear();
  const month = String(currentDate.getMonth() + 1).padStart(2, "0");
  const day = String(currentDate.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export { sleep };
