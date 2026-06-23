import { openInputs, serverId } from "./state.mjs";
import { pageStyles } from "./styles.mjs";
import { getCurrentBranch, getDefaultBaseline, getSeriesEntries, parsePrNumber } from "./git.mjs";
import { escapeHtml } from "./html.mjs";
export function renderPickerRow(entry, index) {
    const isWorktree = entry.kind === "worktree";
    return `<div class="picker-row ${isWorktree ? "worktree" : "commit"}" data-index="${index}" data-ui-section="review-row" data-ui-label="${escapeHtml(entry.title)}" data-ui-detail="${escapeHtml(entry.subtitle)}">
        <span class="row-content">
          <span class="row-title">${escapeHtml(entry.title)}</span>
          <span class="row-subtitle">${escapeHtml(entry.subtitle)}</span>
        </span>
      </div>`;
}

export async function renderHtml(instanceId) {
    const input = openInputs.get(instanceId) || {};
    const requestedBranch = typeof input.branch === "string" ? input.branch.trim() : "";
    const requestedBaseline = typeof input.baseline === "string" ? input.baseline.trim() : "";
    const requestedRange = typeof input.range === "string" ? input.range.trim() : "";
    const requestedPrNumber = parsePrNumber(requestedBranch);

    let branch;
    let baseline;
    let entries = [];
    let rangeText;
    if (requestedPrNumber) {
        branch = requestedPrNumber;
        baseline = requestedBaseline;
        rangeText = requestedRange;
    } else {
        branch = await getCurrentBranch();
        const headRef = branch || "HEAD";
        baseline = requestedBaseline || await getDefaultBaseline(headRef);
        entries = await getSeriesEntries(baseline, headRef, true);
        rangeText = requestedRange;
    }

    const initialPrNumber = requestedPrNumber;
    const initialTargetMode = initialPrNumber ? "pr" : "branch";

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Repository Review Canvas</title>
    <style>
${pageStyles}
    </style>
  </head>
  <body>
    <main>
      <section class="review-layout" aria-label="Review target selection" data-ui-section="review-layout" data-ui-label="Review target selection">
        <article class="review-panel" data-ui-section="review-panel" data-ui-label="Review target panel">
      <div class="review-panel-body">
            <aside class="left-pane" data-ui-section="left-pane" data-ui-label="Review picker pane">
              <section class="sidebar-section range-section" data-ui-section="commit-range-picker" data-ui-label="Commit range picker">
                <div class="section-header">
                  <div class="range-fields">
                    <div class="target-card">
                      <div class="workspace-header">
                        <h2 class="section-title range-field-label">Workspace</h2>
                        <div class="target-tabs" role="tablist" aria-label="Review target type">
                          <button id="pr-tab" class="target-tab ${initialTargetMode === "pr" ? "active" : ""}" type="button" role="tab" aria-selected="${initialTargetMode === "pr"}" aria-controls="pr-panel" data-target-mode="pr">PR</button>
                          <button id="branch-tab" class="target-tab ${initialTargetMode === "branch" ? "active" : ""}" type="button" role="tab" aria-selected="${initialTargetMode === "branch"}" aria-controls="branch-panel" data-target-mode="branch">local</button>
                        </div>
                      </div>
                      <div id="pr-panel" class="target-panel ${initialTargetMode === "pr" ? "active" : ""}" role="tabpanel" aria-labelledby="pr-tab">
                        <div class="range-field-row">
                          <h2 class="section-title range-field-label">PR</h2>
                          <input id="pr-number-text" class="range-text" type="text" value="${escapeHtml(initialPrNumber)}" aria-label="Pull request number" title="Pull request number" autocomplete="off" autocapitalize="off" spellcheck="false" />
                        </div>
                        <div class="target-actions">
                          <div class="loaded-target-status" aria-live="polite"></div>
                          <button id="checkout-pr-button" class="load-button" type="button">Checkout</button>
                          <button id="load-pr-button" class="load-button" type="button">Load</button>
                        </div>
                      </div>
                      <div id="branch-panel" class="target-panel ${initialTargetMode === "branch" ? "active" : ""}" role="tabpanel" aria-labelledby="branch-tab">
                        <div class="range-field-row">
                          <h2 class="section-title range-field-label">Baseline</h2>
                          <input id="baseline-text" class="range-text" type="text" value="${escapeHtml(baseline)}" aria-label="Baseline commit" title="Baseline commit" autocomplete="off" autocapitalize="off" spellcheck="false" />
                        </div>
                        <div class="target-actions">
                          <div class="loaded-target-status" aria-live="polite"></div>
                          <button id="load-branch-button" class="load-button" type="button">Load</button>
                        </div>
                      </div>
                    </div>
                    <div class="range-field-row overview-row">
                      <h2 class="section-title range-field-label">Overview</h2>
                      <span class="overview-open-wrap">
                        <button id="overview-button" class="overview-open-link" type="button">open</button>
                        <span id="overview-spinner" class="section-spinner" aria-label="Loading overview"></span>
                      </span>
                    </div>
                    <div class="range-field-row">
                      <h2 class="section-title range-field-label field-help range-help">Range</h2>
                      <span class="range-input-wrap">
                        <input id="range-text" class="range-text" type="text" value="${escapeHtml(rangeText)}" aria-label="Selected git range" title="Range" autocomplete="off" autocapitalize="off" spellcheck="false" />
                        <button id="range-clear-button" class="range-clear-button" type="button" aria-label="Clear range" title="Clear range">×</button>
                      </span>
                    </div>
                  </div>
                </div>
                <button id="range-toggle" class="range-toggle" type="button" aria-expanded="false">show selection</button>
                <div id="range-list" class="range-list">
                  <div class="selection-controls">
                    <label class="expand-toggle">
                      <input id="expand-range" type="checkbox" />
                      Expand
                    </label>
                    <button class="selection-refresh" type="button" onclick="location.reload()" aria-label="Refresh review data">
                      <svg viewBox="0 0 16 16" aria-hidden="true" fill="none">
                        <path d="M13 4.5v-3h-3" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                        <path d="M12.5 7A4.5 4.5 0 1 0 11 10.4" stroke-width="1.5" stroke-linecap="round"></path>
                      </svg>
                      Refresh
                    </button>
                  </div>
                  <div class="checklist" data-ui-section="commit-checklist" data-ui-label="Commit checklist">
                  </div>
                </div>
              </section>
              <div id="left-pane-splitter" class="pane-splitter" role="separator" aria-orientation="horizontal" aria-label="Resize selection and files panes"></div>
              <section class="sidebar-section file-section" data-ui-section="file-tree" data-ui-label="Changed files tree">
                <div class="file-section-header">
                  <h2 class="section-title">Files</h2>
                  <span id="files-spinner" class="section-spinner" aria-label="Loading file status"></span>
                </div>
                <div id="file-tree" class="file-tree"></div>
              </section>
            </aside>
            <div id="left-main-splitter" class="main-splitter" role="separator" aria-orientation="vertical" aria-label="Resize files and diff panes" title="Drag to resize. Double-click to hide or show the left pane."></div>
            <section class="main-pane" data-ui-section="diff-pane" data-ui-label="Diff pane">
              <div class="diff-header" data-ui-section="diff-header" data-ui-label="Diff header">
                <strong id="diff-title" class="diff-title">Diff</strong>
                <div class="diff-tools">
                  <button id="diff-reviewed-toggle" class="diff-reviewed-toggle" type="button" aria-pressed="false" disabled>
                    <span class="reviewed-checkbox" aria-hidden="true"></span>
                    <span>Reviewed</span>
                  </button>
                  <button id="diff-ignore-whitespace" class="diff-whitespace-button diff-mode-button" type="button" aria-pressed="false" aria-label="Ignore whitespace changes" title="Ignore whitespace changes">≈</button>
                  <button id="diff-visible-whitespace" class="diff-whitespace-button diff-mode-button" type="button" aria-pressed="false" aria-label="Show visible whitespace" title="Show visible whitespace">a·b</button>
                  <div class="diff-mode-toggle" role="group" aria-label="Diff side">
                    <button class="diff-side-button diff-mode-button" type="button" data-diff-side="left">Left</button>
                    <button class="diff-side-button diff-mode-button active" type="button" data-diff-side="both">Both</button>
                    <button class="diff-side-button diff-mode-button" type="button" data-diff-side="right">Right</button>
                  </div>
                  <button id="diff-scroll-lock" class="diff-lock-button diff-mode-button active" type="button" aria-pressed="true" aria-label="Unlock SxS scroll sync" title="SxS scroll sync locked">
                    <svg class="lock-icon" viewBox="0 0 16 16" aria-hidden="true" fill="none">
                      <rect x="3.5" y="7" width="9" height="6.5" rx="1.25" stroke-width="1.4"></rect>
                      <path class="lock-shackle" d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" stroke-width="1.4" stroke-linecap="round"></path>
                    </svg>
                  </button>
                  <div class="diff-mode-toggle" role="group" aria-label="Diff layout">
                    <button id="diff-mode-sxs" class="diff-layout-button diff-mode-button" type="button" data-diff-style="split">SxS</button>
                    <button id="diff-mode-inline" class="diff-layout-button diff-mode-button active" type="button" data-diff-style="unified">Inline</button>
                  </div>
                  <button id="diff-help-button" class="diff-help-button diff-mode-button" type="button" aria-label="Show keyboard shortcuts" title="Show keyboard shortcuts">?</button>
                </div>
              </div>
              <div class="diff-view-wrap">
                <div id="diff-view" class="diff-view"></div>
                <div class="font-size-floating-control" role="group" aria-label="Font size">
                  <button id="font-size-decrease" class="font-size-button" type="button" aria-label="Decrease font size" title="Decrease font size">A-</button>
                  <button id="font-size-label" class="font-size-label" type="button" aria-label="Set font size" title="Set font size">100%</button>
                  <input id="font-size-input" class="font-size-input" type="text" inputmode="numeric" pattern="[0-9]*" aria-label="Font size percentage" hidden>
                  <button id="font-size-increase" class="font-size-button" type="button" aria-label="Increase font size" title="Increase font size">A+</button>
                </div>
              </div>
              <div id="comments-splitter" class="comments-splitter" role="separator" aria-orientation="horizontal" aria-label="Resize diff and comments panes" title="Drag to resize. Double-click to hide or show comments."></div>
              <section class="comments-pane" aria-label="Local comments">
                <div class="comments-header">
                  <span id="comments-title" class="comments-title">Comments</span>
                  <span id="comments-target" class="comments-target">Select a diff line to comment.</span>
                </div>
                <div id="comment-composer" class="comment-composer">
                  <div id="comment-context" class="comment-context"></div>
                  <textarea id="comment-body" class="comment-body" placeholder="Leave a local comment..." autocomplete="off" autocapitalize="off" spellcheck="true"></textarea>
                  <div class="comment-actions">
                    <button id="comment-cancel-button" class="load-button" type="button">Cancel</button>
                    <button id="comment-save-button" class="load-button" type="button">Add comment</button>
                  </div>
                </div>
                <div id="comments-list" class="comments-list"></div>
              </section>
            </section>
          </div>
        </article>
      </section>
    </main>
    <dialog id="diff-help-dialog" class="help-dialog" aria-labelledby="diff-help-title">
      <form method="dialog" class="help-dialog-card">
        <div class="help-dialog-header">
          <h2 id="diff-help-title">Keyboard shortcuts</h2>
          <button id="diff-help-close" class="help-close-button" type="submit" value="close" aria-label="Close keyboard shortcuts">×</button>
        </div>
        <dl class="shortcut-list">
          <div><dt>F7</dt><dd>Go to previous diff change.</dd></div>
          <div><dt>F8</dt><dd>Go to next diff change.</dd></div>
          <div><dt>Space</dt><dd>Toggle reviewed state for the focused file or folder.</dd></div>
          <div><dt>Space at end prompt</dt><dd>Mark the current file reviewed and move to the next file.</dd></div>
          <div><dt>Enter in range or target fields</dt><dd>Load the typed range, PR, branch, or baseline.</dd></div>
          <div><dt>Enter on a folder</dt><dd>Expand or collapse that folder in the file tree.</dd></div>
          <div><dt>Double-click separator</dt><dd>Collapse or restore the panes on either side of the separator handle.</dd></div>
        </dl>
      </form>
    </dialog>
    <script>
      window.__codeReviewCanvas = {
        serverId: ${JSON.stringify(serverId)},
        initialTargetMode: ${JSON.stringify(initialTargetMode)},
      };
    </script>
    <script type="module" src="/client.mjs"></script>
  </body>
</html>`;
}
