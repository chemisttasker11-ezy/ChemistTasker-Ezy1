type DisplayNameSource = {
  username?: string | null;
  first_name?: string | null;
  firstName?: string | null;
} | null | undefined;

const clean = (value?: string | null) => (typeof value === "string" ? value.trim() : "");

export function dashboardGreetingName(...sources: DisplayNameSource[]) {
  for (const source of sources) {
    const username = clean(source?.username);
    if (username) return username;
  }

  for (const source of sources) {
    const firstName = clean(source?.first_name) || clean(source?.firstName);
    if (firstName) return firstName;
  }

  return "there";
}
