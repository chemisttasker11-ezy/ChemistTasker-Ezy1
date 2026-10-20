# AHPRA Practitioner Register Lookup

Perform an AHPRA practitioner register lookup for the following registration number:
Registration Number: {registration_number}

Follow these steps in exact sequence:

1. Connect to Chrome:
   - Call `mcp__claude-in-chrome__list_connected_browsers`.
   - Call `mcp__claude-in-chrome__select_browser` using the active browser ID.

2. Open the Register:
   - Call `mcp__claude-in-chrome__tabs_create_mcp` to open a NEW tab at:
     https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx
   - Record the created tab ID so you can close ONLY this tab when finished.
   - Note: If Claude in Chrome reports that permission is required or the site is not allowed, follow the permission refusal rule in Step 4.

3. Search by Registration Number:
   - Locate the "Name or Registration Number" search field (element id `name-reg`).
   - Type the registration number `{registration_number}` into the field.
   - Click the search button.
   - STRICT RULES:
     * NEVER search by practitioner name.
     * NEVER visit any other websites or pages.

4. Inspect Search Results & Security Checks:
   - If any browser tool reports that Claude in Chrome requires permission or that the site is not allowed:
     * STOP IMMEDIATELY.
     * Close the tab you created if possible.
     * Return JSON with outcome "error" and error text starting exactly "permission_required:" (e.g. "permission_required: Claude in Chrome requires permission for ahpra.gov.au").
     * Do NOT return outcome "blocked" for permission refusals.
   - If a CAPTCHA, access-denied page, Cloudflare challenge, or bot detection screen appears from the AHPRA site itself at ANY point:
     * STOP IMMEDIATELY.
     * Do NOT attempt to solve or bypass it.
     * Close the tab you created.
     * Return JSON with outcome "blocked".
   - If the search returns "No results found" or zero matching practitioners:
     * Close the tab you created.
     * Return JSON with outcome "not_found".
   - If a single matching result is returned:
     * Open/click the single matching result to navigate to the practitioner details page.
     * Call `mcp__claude-in-chrome__get_page_text` to read the practitioner page text. Read the WHOLE record page text, including sections below Conditions, Undertakings and Reprimands.

5. Fill the JSON Fields:
   - Read the WHOLE record page text, including sections below Conditions, Undertakings and Reprimands (such as Registration Requirements).
   - From the page text, extract:
     * name: Full practitioner name as shown on the register (string).
     * profession: Registered profession (string, e.g. "Pharmacist").
     * registration_status: Current registration status (string, e.g. "Registered").
     * registration_type: Type of registration (string, e.g. "General", "Provisional").
     * expiry_date: Expiry date in "YYYY-MM-DD" format, or null if not found.
     * conditions: Boolean (true if conditions are present, false otherwise).
     * undertakings: Boolean (true if undertakings are present, false otherwise).
     * reprimands: Boolean (true if reprimands or disciplinary notations are present, false otherwise).
     * conditions, undertakings and reprimands MUST each be an explicit JSON true or false, never null or omitted. If you cannot read any of these sections, return outcome "error" with error "restriction sections unreadable" instead of guessing.
     * registration_requirements: The text of the Registration Requirements section, or "" if absent or "None"; keep it short, at most 600 characters.
     * supervised_practice: Boolean (true if that text mentions supervision, else false).

6. Cleanup:
   - Call `mcp__claude-in-chrome__tabs_close_mcp` to close ONLY the tab you opened in Step 2.
   - Do NOT close any other tabs or browser windows.

7. Response Format:
   Reply with ONLY a JSON object (no markdown formatting, no code fences, no explanations outside the JSON).

Schema when found:
{
  "outcome": "found",
  "register": {
    "name": "<Practitioner Name>",
    "profession": "<Profession>",
    "registration_status": "<Registration Status>",
    "registration_type": "<Registration Type>",
    "expiry_date": "YYYY-MM-DD",
    "conditions": false,
    "undertakings": false,
    "reprimands": false,
    "registration_requirements": "",
    "supervised_practice": false
  },
  "error": ""
}

Schema when no result found:
{
  "outcome": "not_found",
  "register": null,
  "error": ""
}

Schema when blocked by CAPTCHA / bot check / access denied:
{
  "outcome": "blocked",
  "register": null,
  "error": "Access blocked by bot detection or CAPTCHA"
}

Schema when Claude in Chrome requires permission or site is not allowed:
{
  "outcome": "error",
  "register": null,
  "error": "permission_required: Claude in Chrome requires permission for ahpra.gov.au"
}
