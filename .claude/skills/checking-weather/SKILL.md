---
name: checking-weather
description: Use when the user asks for current weather, temperature, or conditions in a city — fetches live data directly via curl and wttr.in without needing a browser or the WebFetch tool.
---

# Checking Weather

## Overview

Current weather for any city, straight from the terminal. [wttr.in](https://wttr.in) is a free weather service that returns plain text, ASCII art, or JSON — no API key, no browser, no WebFetch round trip through a summarization model.

## When to Use

- User asks "what's the weather in X" / "clima en X" / temperature, humidity, wind, forecast for a city.
- Prefer this over WebFetch for weather: it's a direct data fetch (fast, structured), not a page to be summarized.

## Quick Reference

| Goal | Command |
|---|---|
| One-line summary | `curl -s "wttr.in/<City>?format=3"` |
| Full ASCII forecast (3-day) | `curl -s "wttr.in/<City>"` |
| Structured JSON (for parsing) | `curl -s "wttr.in/<City>?format=j1"` |
| Force metric units | append `?m` |

City names with spaces: use `+` (`wttr.in/New+York`). Disambiguate common names with a country code: `wttr.in/Bogota,CO`.

## Implementation

Always present the result to the user as a **markdown table with a condition icon** — never a raw one-line sentence. Extract current conditions from the JSON endpoint with `jq`, mapping the condition text to an emoji:

```bash
curl -s "wttr.in/Bogota,CO?format=j1" | jq -r '
  .current_condition[0] as $c |
  .nearest_area[0] as $a |
  ($c.weatherDesc[0].value) as $desc |
  ($desc | ascii_downcase) as $d |
  (if ($d|contains("thunder")) then "⛈️"
   elif ($d|contains("snow")) then "❄️"
   elif ($d|contains("sleet")) then "🌨️"
   elif ($d|contains("rain")) or ($d|contains("drizzle")) then "🌧️"
   elif ($d|contains("fog")) or ($d|contains("mist")) then "🌫️"
   elif ($d|contains("overcast")) then "☁️"
   elif ($d|contains("cloud")) then "⛅"
   elif ($d|contains("sunny")) or ($d|contains("clear")) then "☀️"
   else "🌡️" end) as $icon |
  "| \($a.areaName[0].value), \($a.country[0].value) | \($icon) \($desc) | \($c.temp_C)°C | \($c.FeelsLikeC)°C | \($c.humidity)% | \($c.windspeedKmph) km/h |"
'
```

This prints one ready-to-use markdown table row: `| Bogotá, Colombia | 🌧️ Patchy rain nearby | 17°C | 12°C | 71% | 7 km/h |`. Prepend the header once:

```
| Location | Condition | Temp | Feels Like | Humidity | Wind |
|---|---|---|---|---|---|
| Bogotá, Colombia | 🌧️ Patchy rain nearby | 17°C | 12°C | 71% | 7 km/h |
```

For multiple cities (comparisons), run the command once per city and append each as another row under the same header — don't repeat the header.

Icon keyword matching is deliberately simple substring matching on `weatherDesc` (covers all standard wttr.in condition strings: Clear, Sunny, Partly/Overcast cloudy, Mist/Fog, Patchy/Light/Heavy rain, Drizzle, Snow, Sleet, Thundery outbreaks). Fall through to 🌡️ for anything unmatched.

Other useful fields under `current_condition[0]`: `precipMM`, `visibility`, `pressure`, `uvIndex`, `winddir16Point` — add extra columns for these only if the user asks for more detail. Multi-day forecast is under `.weather[].hourly[]`.

## Common Mistakes

- **Requires network access.** In sandboxed environments (e.g. Claude Code's default Bash sandbox), `curl` needs network egress explicitly allowed — expect a permission prompt the first time.
- **Don't poll faster than once a minute.** wttr.in is a shared free service; hammering it risks rate-limiting or a temporary ban.
- **Ambiguous city names return the wrong location silently.** Always qualify with a country code for anything other than a well-known capital.
- **`jq` not installed** → fall back to `format=3` (plain text, no parsing needed) or `format=4` (one line, adds wind direction).
