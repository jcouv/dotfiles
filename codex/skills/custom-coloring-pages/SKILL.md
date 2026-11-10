---
name: custom-coloring-pages
description: Create custom printable coloring pages by selecting a theme, exploring illustration styles, preparing separate art components, and arranging them into a page or interactive layout.
metadata:
  short-description: Make themed custom coloring pages
---

# Custom Coloring Pages

Use this skill to guide a coloring-page project from theme selection through style experiments, component artwork, and printable output. Keep all project files together in the user's chosen folder. Preserve source photos and approved artwork.

## Set the direction

- If the user has not provided a theme, ask what theme or occasion they want. Help them choose a cohesive set of people, creatures, objects, and small decorative motifs that can populate a page.
- If the page will feature real people, collect labeled reference photos and save them without altering the originals. If a label is missing, use a temporary filename and ask for the names.
- Establish page size, orientation, detail level, whether captions are wanted, and whether the user wants a single finished page or an interactive layout. Use US Letter by default when the user asks for a US page but leaves orientation open. Use larger formats only when requested or clearly established.
- Keep user preferences local to the current project. Do not carry a prior project's theme or motifs into a new coloring-page project.

## Experiment with style

- Start with a small set of samples using one subject or a representative group. Compare distinct requested styles before producing a full set. Use the user's response to settle the visual direction.
- Use the built-in image generation tool with reference photos or approved art. For revisions, state what should change and what should remain fixed. Preserve recognizable features, pose, and silhouette when requested.
- Translate the chosen direction into clean printable line art: bold contours, open spaces for coloring, and an appropriate level of interior detail. Remove photo backgrounds unless the user wants them. Keep full shoulders and arms in frame when relevant; if a figure is cropped at the bottom, prefer a deliberate soft fade or clean visual finish over an abrupt cutoff.
- Do not add captions, logos, or franchise characters unless requested. Treat named cartoons or other works as style references; keep the depicted people and original composition distinct.
- Number generated samples in sequence so the user can refer to them later. Save each approved variation separately with a descriptive filename and keep a simple source-to-sample mapping when the set grows.

## Create theme-matched components

- Make people, couples, animals, objects, and decorative motifs as separate image assets when the user wants flexible page composition.
- Build supporting objects from the chosen theme. For example, a Halloween page might include spiders, skeletons, pumpkins, and webs; a game-night theme might include dice, cards, snacks, and drinks. Ask for feedback on motifs when their design matters, and reuse the user's preferred variants in the composition.
- Use bold outlines and coloring-friendly details across components. Keep decorative objects readable when printed smaller than portraits.
- When transparency is requested, remove the white page background while preserving the ink and antialiased edges as alpha. Save transparent copies separately and point the layout tool at those copies; never replace source photos or approved originals.

## Build an interactive layout

- When requested, create a local HTML layout studio in the project folder, using relative paths to its artwork assets so it opens from that folder.
- Include a palette of components and support drag-and-drop placement, movement, rotation, resizing, multiple copies, remove, and sensible layer ordering. Keep captions off unless requested.
- Offer page-size and orientation choices appropriate to the project, print/save-to-PDF, and, when practical, browser-based layout persistence plus JSON export/import.
- Keep controls usable while the page is zoomed to fit the screen. Allow components to overlap when the user wants a collage, but avoid accidental clipping at print edges.

## Export and review

- Use the PDF skill and its configured runtime for PDF authoring when available. Use `mcp__codex_app__load_workspace_dependencies` to locate bundled Python tools if needed; do not assume the system Python has document libraries installed.
- Use the exact approved components in the output rather than regenerating them during composition, so likeness and selected details remain stable.
- Render the exported PDF and inspect it before delivery. Confirm page count and dimensions, consistent placement, whitespace, clipping, and that each component appears the requested number of times.
- Save a new version when revising a page rather than silently overwriting an earlier approved composition. Link both the interactive layout and print-ready file when both are requested or available.
