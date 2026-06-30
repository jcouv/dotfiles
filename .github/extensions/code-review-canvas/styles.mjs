export const pageStyles = `:root {
  color-scheme: light dark;
  --review-font-scale: 1;
  --background: #f6f8fa;
  --border: #d0d7de;
  --muted: #57606a;
  --panel: #ffffff;
  --git-added: #22863a;
  --git-copied: #0366d6;
  --git-deleted: #d73a49;
  --git-modified: #b08800;
  --git-renamed: #6f42c1;
  --range-edge: #6f7f8f;
  --selected: #eaeef2;
  --selected-border: #0969da;
  --text: #1f2328;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0d1117;
    --border: #30363d;
    --muted: #8b949e;
    --panel: #161b22;
    --git-added: #56a36c;
    --git-copied: #58a6ff;
    --git-deleted: #f85149;
    --git-modified: #d29922;
    --git-renamed: #a371f7;
    --range-edge: #6f7f8f;
    --selected: #202a36;
    --selected-border: #58a6ff;
    --text: #f0f6fc;
  }
}

* {
  box-sizing: border-box;
}

html,
body {
  width: 100%;
  height: 100%;
}

html {
  font-size: calc(16px * var(--review-font-scale));
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family: system-ui, sans-serif;
  overflow: hidden;
}

main {
  height: 100vh;
  width: 100vw;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 1.75rem;
}

h2 {
  margin: 0.5rem 0 0.25rem;
  font-size: 1rem;
}

p {
  margin: 0;
  color: var(--muted);
}

button {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  color: var(--text);
  font: inherit;
  padding: 0.5rem 0.75rem;
}

.review-layout {
  display: grid;
  gap: 1rem;
  height: 100%;
}

.review-panel {
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  border: 0;
  border-radius: 0;
  background: var(--panel);
  overflow: hidden;
}

.review-panel-body {
  display: grid;
  grid-template-columns: var(--left-pane-width, 24rem) 6px minmax(0, 1fr);
  min-height: 0;
}

.left-pane {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.main-splitter {
  position: relative;
  border-right: 1px solid var(--border);
  border-left: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel), var(--background) 35%);
  cursor: col-resize;
}

.main-splitter::before {
  position: absolute;
  top: 50%;
  left: 1px;
  width: 2px;
  height: 2rem;
  transform: translateY(-50%);
  background: var(--muted);
  box-shadow: 3px 0 0 var(--muted);
  content: "";
  opacity: 0.9;
}

.left-pane.selection-visible {
  --selection-height: 18rem;
}

.sidebar-section {
  min-height: 0;
  overflow: auto;
  padding: 0.75rem;
}

.sidebar-section.range-section {
  display: flex;
  flex-direction: column;
  flex: 0 0 auto;
  overflow: visible;
}

.left-pane.selection-visible .range-section {
  flex-basis: var(--selection-height);
  overflow: hidden;
}

.file-section {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}

.sidebar-section + .sidebar-section {
  border-top: 0;
}

.pane-splitter {
  position: relative;
  display: none;
  flex: 0 0 6px;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel), var(--background) 35%);
  cursor: row-resize;
}

.left-pane.selection-visible .pane-splitter {
  display: block;
}

.pane-splitter::before {
  position: absolute;
  top: 1px;
  left: 50%;
  width: 2rem;
  height: 1px;
  transform: translateX(-50%);
  background: var(--muted);
  box-shadow: 0 2px 0 var(--muted);
  content: "";
  opacity: 0.75;
}

.section-title {
  margin: 0 0 0.5rem;
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
}

.section-header {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-bottom: 0.5rem;
}

.section-header .section-title {
  margin: 0;
}

.file-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.file-section-header .section-title {
  margin: 0;
}

.section-spinner {
  display: none;
  width: 0.85rem;
  height: 0.85rem;
  border: 2px solid color-mix(in srgb, var(--muted), transparent 65%);
  border-top-color: var(--muted);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.section-spinner.visible {
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.range-toggle {
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.75rem;
  flex: none;
  display: block;
  padding: 0;
  text-align: center;
  width: 100%;
}

.range-fields {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.375rem;
}

.range-field-row {
  display: grid;
  grid-template-columns: 4.25rem minmax(0, 1fr);
  align-items: center;
  gap: 0.25rem;
}

.range-field-label {
  margin: 0;
}

.loaded-target-status {
  color: var(--muted);
  flex: 1 1 auto;
  font-size: 0.75rem;
  min-height: 1rem;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loaded-target-status.loading {
  font-style: italic;
}

.loaded-target-status.error {
  color: var(--git-deleted);
}

.overview-row {
  align-items: center;
}

.overview-open-link {
  border: 0;
  background: transparent;
  color: var(--selected-border);
  cursor: pointer;
  font: 0.75rem system-ui, sans-serif;
  padding: 0;
  text-align: left;
}

.overview-open-link:hover {
  text-decoration: underline;
}

.overview-open-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.workspace-header {
  display: grid;
  grid-template-columns: 4.25rem minmax(0, 1fr);
  align-items: end;
  gap: 0.25rem;
}

.field-help {
  position: relative;
  cursor: help;
}

.field-help::after {
  position: absolute;
  z-index: 10;
  top: 1.35rem;
  left: 0;
  display: none;
  width: 20rem;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
  color: var(--text);
  font: 0.75rem ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  line-height: 1.35;
  text-transform: none;
  white-space: pre-line;
}

.field-help:hover::after {
  display: block;
}

.range-help::after {
  content: "Range syntax\\A\\A• Leave blank for the whole baseline-to-branch range\\A• Use A or A..B\\A• Numbers are commits after baseline: 1 = first commit\\A• Use 1.. or 1..WORKTREE to include uncommitted changes\\A• Normal git refs also work: HEAD~2..HEAD, main..HEAD, dotnet/main..WORKTREE";
}

.target-card {
  overflow: hidden;
}

.target-tabs {
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  gap: 0.25rem;
}

.target-tab {
  border: 1px solid var(--border);
  border-bottom: 0;
  border-radius: 5px 5px 0 0;
  background: color-mix(in srgb, var(--panel), var(--background) 35%);
  color: var(--muted);
  font: 0.75rem system-ui, sans-serif;
  margin-right: 0.125rem;
  padding: 0.25rem 0.625rem;
}

.target-tab.active {
  background: var(--panel);
  color: var(--text);
  font-weight: 600;
  transform: translateY(1px);
}

.target-panel {
  display: none;
  gap: 0.375rem;
  border: 1px solid var(--border);
  border-radius: 0 0 8px 8px;
  background: var(--panel);
  padding: 0.75rem;
}

.target-panel.active {
  display: grid;
}

.target-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.375rem;
}

.range-text {
  min-width: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  color: var(--text);
  font: 0.75rem ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  padding: 0.25rem 0.375rem;
}

.range-input-wrap {
  position: relative;
  display: flex;
  min-width: 0;
}

.range-input-wrap .range-text {
  width: 100%;
  padding-right: 1.75rem;
}

.range-clear-button {
  position: absolute;
  top: 50%;
  right: 0.25rem;
  display: none;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--muted);
  font: 1rem/1 system-ui, sans-serif;
  transform: translateY(-50%);
}

.range-clear-button.visible {
  display: flex;
}

.range-clear-button:hover {
  background: var(--selected);
  color: var(--text);
}

.load-button {
  justify-self: end;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--selected);
  color: var(--text);
  font: 0.75rem system-ui, sans-serif;
  padding: 0.25rem 0.625rem;
}

.load-button:hover {
  border-color: var(--selected-border);
}

.expand-toggle {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  color: var(--muted);
  font-size: 0.75rem;
  user-select: none;
}

.selection-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.375rem;
}

.selection-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.75rem;
  padding: 0;
}

.selection-refresh svg {
  width: 0.875rem;
  height: 0.875rem;
  stroke: currentColor;
}

.range-list {
  display: none;
  flex: 1 1 auto;
  margin-right: -0.75rem;
  max-height: none;
  min-height: 0;
  overflow: auto;
  padding-right: 0.75rem;
  padding-top: 0.375rem;
}

.range-list.visible {
  display: block;
}

.range-list,
.range-list * {
  cursor: default;
}

.main-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) 6px var(--comments-height, 14rem);
  min-width: 0;
  min-height: 0;
}

.main-pane.overview-mode {
  grid-template-rows: minmax(0, 1fr) 6px var(--comments-height, 14rem);
}

.main-pane.comments-collapsed {
  grid-template-rows: auto minmax(0, 1fr) 6px 0;
}

.main-pane.overview-mode.comments-collapsed {
  grid-template-rows: minmax(0, 1fr) 6px 0;
}

.main-pane.overview-mode .diff-header {
  display: none;
}

.comments-splitter {
  position: relative;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--panel), var(--background) 35%);
  cursor: row-resize;
}

.comments-splitter::before {
  position: absolute;
  top: 1px;
  left: 50%;
  width: 2rem;
  height: 1px;
  transform: translateX(-50%);
  background: var(--muted);
  box-shadow: 0 2px 0 var(--muted);
  content: "";
  opacity: 0.75;
}

.diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-height: 1.875rem;
  padding: 0.25rem 0.75rem;
  border-bottom: 1px solid var(--border);
}

.diff-title {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 400;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diff-mode-toggle {
  display: inline-flex;
  flex: none;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
}

.diff-tools {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 0.375rem;
}

.diff-mode-button {
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.diff-mode-button + .diff-mode-button {
  border-left: 1px solid var(--border);
}

.diff-mode-button.active {
  background: var(--selected);
  color: var(--text);
  font-weight: 600;
}

.diff-lock-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 0 0.25rem;
  width: 1.625rem;
  height: 1.5rem;
  padding: 0;
  border-radius: 6px;
}

.diff-lock-button svg {
  width: 0.875rem;
  height: 0.875rem;
  stroke: currentColor;
}

.diff-reviewed-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  color: var(--muted);
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.diff-reviewed-toggle:disabled {
  opacity: 0.5;
}

.reviewed-checkbox {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 3px;
  color: var(--git-added);
  font-size: 0.75rem;
  line-height: 1;
}

.diff-reviewed-toggle.reviewed {
  color: var(--text);
}

.diff-reviewed-toggle.reviewed .reviewed-checkbox::before {
  content: "✓";
}

.diff-whitespace-button {
  min-width: 1.625rem;
}

.diff-help-button {
  min-width: 1.625rem;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--background);
  font-weight: 700;
  padding: 0.125rem 0;
}

.diff-view-wrap {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.diff-view {
  position: relative;
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: auto;
  padding: 0;
  background: var(--background);
  cursor: text;
}

.diff-view * {
  cursor: text;
}

.font-size-floating-control {
  position: absolute;
  left: 0.75rem;
  bottom: 0.75rem;
  z-index: 6;
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--panel), transparent 3%);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
}

.font-size-button {
  min-width: 2.25rem;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--muted);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.625rem;
}

.font-size-button + .font-size-button {
  border-left: 1px solid var(--border);
}

.font-size-label {
  align-items: center;
  border-left: 1px solid var(--border);
  border-radius: 0;
  border-right: 0;
  border-top: 0;
  border-bottom: 0;
  background: transparent;
  color: var(--muted);
  display: inline-flex;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  min-width: 3rem;
  justify-content: center;
  padding: 0.25rem 0.5rem;
  user-select: none;
}

.font-size-label[hidden],
.font-size-input[hidden] {
  display: none;
}

.font-size-label:hover,
.font-size-input:focus {
  background: var(--selected);
  color: var(--text);
}

.font-size-input {
  width: 3.4rem;
  min-width: 3.4rem;
  border: 0;
  border-left: 1px solid var(--border);
  border-radius: 0;
  background: var(--selected);
  color: var(--text);
  font: 600 0.75rem system-ui, sans-serif;
  font-variant-numeric: tabular-nums;
  outline: 0;
  padding: 0.25rem 0.375rem;
  text-align: center;
}

.font-size-label + .font-size-button,
.font-size-input + .font-size-button {
  border-left: 1px solid var(--border);
}

.font-size-button:hover:not(:disabled) {
  background: var(--selected);
  color: var(--text);
}

.font-size-button:disabled {
  opacity: 0.45;
}

.help-dialog {
  max-width: min(34rem, calc(100vw - 2rem));
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
  color: var(--text);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.32);
}

.help-dialog::backdrop {
  background: rgba(0, 0, 0, 0.38);
}

.help-dialog-card {
  margin: 0;
  padding: 1rem;
}

.help-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.help-dialog-header h2 {
  margin: 0;
  color: var(--text);
  font-size: 1rem;
}

.help-close-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border-radius: 999px;
}

.shortcut-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
}

.shortcut-list > div {
  display: grid;
  grid-template-columns: 8.5rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: start;
}

.shortcut-list dt {
  display: inline-flex;
  justify-content: center;
  width: fit-content;
  min-width: 2.75rem;
  margin: 0;
  padding: 0.125rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  color: var(--text);
  font: 600 0.75rem ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
}

.shortcut-list dd {
  margin: 0;
  color: var(--muted);
}

.diff-end-prompt {
  position: absolute;
  left: 50%;
  bottom: 1rem;
  z-index: 5;
  transform: translateX(-50%);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--panel);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
  color: var(--text);
  font-size: 0.8125rem;
  padding: 0.5rem 0.75rem;
  pointer-events: none;
}

.diff-view diffs-container {
  display: block;
  height: 100%;
  min-height: 0;
}

.diff-view.fallback {
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.8125rem;
  line-height: 1.45;
  white-space: pre;
}

.diff-view.reconnecting {
  display: grid;
  place-items: center;
  color: var(--muted);
  font: 0.875rem system-ui, sans-serif;
  white-space: normal;
}

.diff-caret {
  position: absolute;
  z-index: 4;
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-left: 10px solid #0969da;
  filter: drop-shadow(0 0 2px rgba(9, 105, 218, 0.55));
  pointer-events: none;
}

.diff-comment-marker {
  position: absolute;
  z-index: 4;
  right: 1.75rem;
  width: 1.125rem;
  height: 1.125rem;
  border: 1px solid var(--selected-border);
  border-radius: 50%;
  background: var(--panel);
  color: var(--selected-border);
  font: 0.75rem/1 system-ui, sans-serif;
  transform: translateY(-50%);
  pointer-events: auto;
}

.diff-selection-highlight {
  position: absolute;
  z-index: 3;
  border-radius: 3px;
  background: color-mix(in srgb, var(--selected-border), transparent 68%);
  pointer-events: none;
}

.overview-frame {
  width: 100%;
  height: 100%;
  border: 0;
  background: var(--panel);
}

.comments-pane {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  gap: 0.5rem;
  min-height: 0;
  background: var(--panel);
  padding: 0.5rem 0.75rem;
  overflow: hidden;
}

.comments-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.comments-title {
  color: var(--muted);
  font-size: 0.875rem;
  font-weight: 600;
}

.comments-target {
  color: var(--muted);
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-composer {
  display: none;
  gap: 0.375rem;
}

.comment-composer.visible {
  display: grid;
}

.comment-context {
  color: var(--muted);
  font: 0.75rem ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.comment-body {
  width: 100%;
  min-height: 3.25rem;
  resize: vertical;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--background);
  color: var(--text);
  font: 0.8125rem system-ui, sans-serif;
  padding: 0.375rem 0.5rem;
}

.comment-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.375rem;
}

.comments-list {
  min-height: 0;
  overflow: auto;
}

.comment-item {
  display: grid;
  gap: 0.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--background);
  margin-bottom: 0.5rem;
  padding: 0.5rem;
}

.comment-meta {
  color: var(--muted);
  font-size: 0.75rem;
}

.comment-text {
  white-space: pre-wrap;
}

.comment-code {
  color: var(--muted);
  font: 0.75rem ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 1rem;
  margin: 0 0 0.75rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--panel);
}

.entry.worktree {
  border-left: 4px solid var(--range-edge);
}

.picker-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  font-size: 0.875rem;
  gap: 0.375rem;
  isolation: isolate;
  margin-bottom: 0.125rem;
  padding: 0.25rem 0.375rem;
  border-radius: 6px;
  position: relative;
}

.picker-row.in-range {
  background: var(--selected);
}

.picker-row.range-edge {
  box-shadow: none;
}

.picker-row.range-start-edge,
.picker-row.range-end-edge {
  overflow: hidden;
}

.picker-row.range-start-edge::before,
.picker-row.range-end-edge::after {
  position: absolute;
  top: 7px;
  bottom: 7px;
  width: 2px;
  background: var(--range-edge);
  content: "";
  z-index: 0;
}

.picker-row.range-start-edge::before {
  left: 4px;
  border-radius: 999px;
}

.picker-row.range-end-edge::after {
  right: 4px;
  border-radius: 999px;
}

.row-content {
  min-width: 0;
  position: relative;
  z-index: 1;
}

.row-title,
.row-subtitle {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-title {
  font-weight: 400;
}

.picker-row.in-range .row-title {
  font-weight: 600;
}

.row-subtitle {
  color: var(--muted);
  font-size: 0.875rem;
}

.checklist:not(.expanded) .row-subtitle {
  display: none;
}

.badge {
  display: inline-block;
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--muted);
  font-size: 0.75rem;
  padding: 0.125rem 0.5rem;
}

.entry-meta {
  color: var(--muted);
  font-size: 0.875rem;
  white-space: nowrap;
}

.files {
  grid-column: 1 / -1;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.files li,
.empty {
  color: var(--muted);
  font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  font-size: 0.875rem;
  padding-top: 0.25rem;
}

.file-status {
  display: inline-block;
  flex: none;
  margin-left: 0.5rem;
  min-width: 1.5rem;
  text-align: center;
}

.file-status.added,
.file-status.untracked {
  color: var(--git-added);
}

.file-status.modified {
  color: var(--git-modified);
}

.file-status.deleted {
  color: var(--git-deleted);
}

.file-status.renamed {
  color: var(--git-renamed);
}

.file-status.copied {
  color: var(--git-copied);
}

.file-tree {
  display: grid;
  gap: 0.125rem;
  cursor: default;
}

.file-tree * {
  cursor: default;
}

.tree-folder {
  margin-top: 0.25rem;
}

.tree-folder > summary {
  color: var(--muted);
  font-size: 0.875rem;
  padding: 0.25rem 0.375rem;
}

.tree-folder > summary.selected {
  background: var(--selected);
  color: var(--text);
  font-weight: 600;
}

.tree-folder.reviewed > summary,
.file-row.reviewed .file-path {
  color: var(--muted);
  text-decoration: line-through;
}

.file-row.reviewed .file-path::after,
.tree-folder.reviewed > summary::after {
  content: " ✓";
  color: var(--git-added);
}

.tree-children {
  margin-left: 0.45rem;
}

.file-row {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 0.25rem;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  font: 0.875rem system-ui, sans-serif;
  justify-content: space-between;
  min-width: 0;
  padding: 0.25rem 0.25rem;
  text-align: left;
}

.file-row.selected {
  background: var(--selected);
}

.file-row.selected .file-path {
  font-weight: 600;
}

.file-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}`;
