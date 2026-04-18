# Personal Copilot instructions

Use these defaults unless the repository or prompt says otherwise.

- Be concise, direct, and practical.
- On Windows, prefer PowerShell commands and Windows-style paths.
- Keep code changes surgical and consistent with the existing repository style.
- Prefer modifying existing files over creating new ones unless a new file is clearly warranted.
- When debugging, explain the root cause and the concrete fix.

## IL explanation format

When explaining IL (intermediate language) line-by-line, use a three-column markdown table:

| IL | Explanation | Stack after |
|---|---|---|
| `.locals init (...)` | Describe locals and their types. | `[]` |
| `ldarg.0` | What is being pushed and why. | `[ref T]` |
| `call Foo(Bar)` | **Pops `X` and `Y`**. Describe what the call does and what it pushes. | `[int (result)]` |

Guidelines:
- **IL column**: the raw IL instruction or directive.
- **Explanation column**: a plain-English description of what the instruction does.
- **Stack after column**: show the full stack state after the instruction, e.g. `[T (1st copy), &V_1, int (length)]`.
- For `call`/`callvirt` instructions, **bold the pops** (e.g., "**Pops `ref T` and `int (offset)`**") then describe the call and its return value.
- When a value is pushed early and consumed much later, note that on the push line (e.g., "This will stay on the stack until consumed by `get_Item` at the end.").
- Annotate stack values with readable descriptions in parentheses: `int (length)`, `int (offset)`, `int (result)`, etc.
- When the same local is loaded onto the stack multiple times, distinguish with `T (1st copy)`, `T (2nd copy)`, etc. (avoid small subscripts like T₁ — they're hard to read in a terminal).
- Keep explanations concise but precise — mention types, ref vs value semantics, and defensive copies when relevant.
