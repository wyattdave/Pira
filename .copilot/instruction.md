---
description: All web based UI sites and web applications.
applyTo: '**/*.html, **/*.js, **/*.ts' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

- avoid typescript and use vanilla JavaScript where possible
- Use camelCase for variables and functions.
- Prefix variable names: `b` boolean, `i` number, `s` string, `a` array, `o` object, `e` element.
- Ensure variables are type consistent and avoid implicit type coercion by using naming conventions.
- Function-first approach; avoid classes unless necessary.
- Build functions for reusability and testability; avoid inline code blocks.
- Use descriptive names for variables and functions, avoiding abbreviations.
- Use let and const, avoid var.
- Use const for dom elements where possible.
- Use forEach, map, filter, reduce for array operations instead of for loops where appropriate.
- Use arrow functions for anonymous functions and callbacks.
- Use " for html attributes and ' for js strings, ` for template literals.
- Handle errors gracefully with try/catch and user-friendly messages. 
- Be efficient, dont call unnecessary api calls, cache results and reuse when can.
- add light/darkmode and remember status in localstorage
- dont use alerts/ prompts, create themed models
- follow the current codes format, style so that you cant distinguish your code from its code, but if it contradict any previous instructions then ask to either, keep current, new for new code, or refactor existing and new code, if there is no answer presume keep