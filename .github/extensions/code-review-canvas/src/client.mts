import { failedTargetLabel, fileNameFromPath, isPrNumber, loadedTargetLabelForBranch, makeWhitespaceVisible } from "./client-text.mjs";

const initialServerId = window.__codeReviewCanvas?.serverId || "";
const reviewPanelBody = document.querySelector<HTMLElement>(".review-panel-body");
const leftPane = document.querySelector<HTMLElement>(".left-pane");
const mainPane = document.querySelector<HTMLElement>(".main-pane");
const splitter = document.querySelector<HTMLElement>("#left-pane-splitter");
const mainSplitter = document.querySelector<HTMLElement>("#left-main-splitter");
const rangeToggle = document.querySelector<HTMLButtonElement>("#range-toggle");
const rangeList = document.querySelector<HTMLElement>("#range-list");
const checklist = document.querySelector<HTMLElement>(".checklist");
const expandRange = document.querySelector<HTMLInputElement>("#expand-range");
const targetTabs = document.querySelectorAll<HTMLElement>(".target-tab");
const targetPanels = document.querySelectorAll<HTMLElement>(".target-panel");
const prNumberText = document.querySelector<HTMLInputElement>("#pr-number-text");
const baselineText = document.querySelector<HTMLInputElement>("#baseline-text");
const loadedTargetStatuses = document.querySelectorAll<HTMLElement>(".loaded-target-status");
const overviewButton = document.querySelector<HTMLButtonElement>("#overview-button");
const overviewSpinner = document.querySelector<HTMLElement>("#overview-spinner");
const loadPrButton = document.querySelector<HTMLButtonElement>("#load-pr-button");
const checkoutPrButton = document.querySelector<HTMLButtonElement>("#checkout-pr-button");
const loadBranchButton = document.querySelector<HTMLButtonElement>("#load-branch-button");
const rangeText = document.querySelector<HTMLInputElement>("#range-text");
const rangeClearButton = document.querySelector<HTMLButtonElement>("#range-clear-button");
const fileTree = document.querySelector<HTMLElement>("#file-tree");
const filesSpinner = document.querySelector<HTMLElement>("#files-spinner");
const diffTitle = document.querySelector<HTMLElement>("#diff-title");
const diffView = document.querySelector<HTMLElement>("#diff-view");
const commentsSplitter = document.querySelector<HTMLElement>("#comments-splitter");
const commentsTitle = document.querySelector<HTMLElement>("#comments-title");
const commentsTarget = document.querySelector<HTMLElement>("#comments-target");
const commentComposer = document.querySelector<HTMLElement>("#comment-composer");
const commentContext = document.querySelector<HTMLElement>("#comment-context");
const commentBody = document.querySelector<HTMLTextAreaElement>("#comment-body");
const commentCancelButton = document.querySelector<HTMLButtonElement>("#comment-cancel-button");
const commentSaveButton = document.querySelector<HTMLButtonElement>("#comment-save-button");
const commentsList = document.querySelector<HTMLElement>("#comments-list");
const diffLayoutButtons = document.querySelectorAll<HTMLButtonElement>(".diff-layout-button");
const diffSideButtons = document.querySelectorAll<HTMLButtonElement>(".diff-side-button");
const diffScrollLockButton = document.querySelector<HTMLButtonElement>("#diff-scroll-lock");
const diffHelpButton = document.querySelector<HTMLButtonElement>("#diff-help-button");
const diffHelpDialog = document.querySelector<HTMLDialogElement>("#diff-help-dialog");
const diffReviewedToggle = document.querySelector<HTMLInputElement>("#diff-reviewed-toggle");
const diffIgnoreWhitespaceButton = document.querySelector<HTMLButtonElement>("#diff-ignore-whitespace");
const diffVisibleWhitespaceButton = document.querySelector<HTMLButtonElement>("#diff-visible-whitespace");
const fontSizeDecreaseButton = document.querySelector<HTMLButtonElement>("#font-size-decrease");
const fontSizeLabel = document.querySelector<HTMLButtonElement>("#font-size-label");
const fontSizeInput = document.querySelector<HTMLInputElement>("#font-size-input");
const fontSizeIncreaseButton = document.querySelector<HTMLButtonElement>("#font-size-increase");
type DiffNavigationOptions = { forceCrossFile?: boolean };
type ClearReviewedStateOptions = { updateTree?: boolean };
type RequestOverviewOptions = { allowDuringTargetLoad?: boolean; cancelWork?: boolean };
type ClearStaleViewOptions = { clearSelection?: boolean; loading?: boolean };
type LoadSelectedFileDiffOptions = { renderDelayMs?: number; diffNavigation?: "first" | "last" | false };
type LoadDiffDataOptions = LoadSelectedFileDiffOptions & {
  branchChanged?: boolean;
  loadedTargetSuccessLabel?: string;
  openOverviewOnLoad?: boolean;
  preserveSelectedFile?: boolean;
  resetInvalidRange?: boolean;
};
type RangeInputOptions = LoadDiffDataOptions;
let selectedFile = "";
let rangeAnchor = null;
let selectionHeight = 288;
let commentsHeight = 224;
let commentsCollapsed = false;
let leftPaneWidth = 384;
let leftPaneCollapsed = false;
let diffDataLoadVersion = 0;
let fileDiffLoadVersion = 0;
let reviewedStateLoadVersion = 0;
let diffRenderVersion = 0;
let diffDataAbortController = null;
let fileDiffAbortController = null;
let reviewedStateAbortController = null;
let currentOverview = null;
let diffRenderTimer = 0;
let diffRenderCancel = null;
let diffViewer = null;
let diffRailCleanup = null;
let pierreDiffsPromise = null;
let diffStyle = "unified";
let diffSide = "both";
let diffScrollLocked = true;
let diffIgnoreWhitespace = false;
let diffVisibleWhitespace = false;
let currentDiff = "";
let currentFiles = [];
let currentComments = [];
let currentCommentTarget = null;
let commentsLoadVersion = 0;
let suppressNextDiffClick = false;
let diffCaret = null;
let diffCommentMarkers = [];
let diffSelectionHighlights = [];
let diffCaretKey = null;
let diffCaretTop = null;
let rangeInputTimer: number | null = null;
let overviewPollTimer = 0;
let pendingEndPrompt = false;
let selectedFileButton = null;
let selectedTreePath = "";
let selectedTreeElement = null;
let reviewedTreeUpdateHandle = 0;
let reviewCommitSha = "";
let reviewKeysByFile = {};
let reviewedStateReady = false;
let currentEntries = [];
let deferredRangeApplyVersion = 0;
let currentTreeSignature = "";
let reviewFontScale = 1;
const collapsedFolders = new Set();
const folderDomCache = new Map();
const treeModelCache = new Map();
const reviewedPaths = new Set();
const maxTreeModelCacheEntries = 50;
const fontScaleStorageKey = "codeReviewCanvas.fontScale";
const fontScaleStep = 0.1;
let targetMode = window.__codeReviewCanvas?.initialTargetMode || "branch";
let loadedBranch = targetMode === "pr" ? prNumberText.value : "";
let loadedBaseline = baselineText.value;
let loadedTargetSuccessLabel = loadedTargetLabel();
let targetLoadInProgress = targetMode === "pr";

function loadedTargetLabel() {
  return loadedTargetLabelForBranch(loadedBranch);
}

function setLoadedTargetStatus(message, state = "") {
  targetLoadInProgress = state === "loading";
  for (const loadedTargetStatus of loadedTargetStatuses) {
    loadedTargetStatus.textContent = message;
    loadedTargetStatus.title = message;
    loadedTargetStatus.classList.toggle("loading", state === "loading");
    loadedTargetStatus.classList.toggle("error", state === "error");
  }
}

setLoadedTargetStatus(
  targetMode === "pr"
    ? "Loading PR #" + loadedBranch.trim().replace(/^#/, "") + "..."
    : loadedTargetSuccessLabel,
  targetMode === "pr" ? "loading" : "");

function setRangeStatus(message, state = "") {
  showPlainDiff(message);
  diffView.classList.toggle("status-loading", state === "loading");
  diffView.classList.toggle("status-error", state === "error");
}

function setTargetMode(mode) {
  targetMode = mode;
  for (const tab of targetTabs) {
    const selected = tab.dataset.targetMode === mode;
    tab.classList.toggle("active", selected);
    tab.setAttribute("aria-selected", String(selected));
  }
  for (const panel of targetPanels) {
    panel.classList.toggle("active", panel.id === mode + "-panel");
  }
}

function loadPierreDiffs() {
  if (!pierreDiffsPromise) {
    const moduleUrl = "https://esm.sh/@pierre/diffs@1.2.11?bundle";
    pierreDiffsPromise = import(moduleUrl);
  }
  return pierreDiffsPromise;
}

function clampFontScale(value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 1;
  }

  return value;
}

function fontScaleLabel() {
  return Number((reviewFontScale * 100).toFixed(2)).toString() + "%";
}

function parseFontScaleInput(value) {
  const trimmedValue = value.trim();
  const hasPercent = trimmedValue.endsWith("%");
  const trimmed = trimmedValue.replace(/%$/, "").trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return hasPercent || parsed > 1 ? parsed / 100 : parsed;
}

function getDecreasedFontScale() {
  return reviewFontScale > fontScaleStep
    ? reviewFontScale - fontScaleStep
    : reviewFontScale / 2;
}

function updateFontScaleButtons() {
  const scaleLabel = fontScaleLabel();
  const label = "Font size " + scaleLabel;
  fontSizeLabel.textContent = scaleLabel;
  fontSizeLabel.title = label;
  fontSizeInput.value = scaleLabel;
  fontSizeDecreaseButton.title = "Decrease font size (" + label + ")";
  fontSizeIncreaseButton.title = "Increase font size (" + label + ")";
  fontSizeDecreaseButton.disabled = false;
  fontSizeIncreaseButton.disabled = false;
}

function applyFontScaleToOverviewFrame() {
  const frame = diffView.querySelector<HTMLIFrameElement>(".overview-frame");
  if (frame) {
    frame.style.setProperty("zoom", String(reviewFontScale));
  }
}

function setReviewFontScale(value, persist = true) {
  reviewFontScale = clampFontScale(value);
  document.documentElement.style.setProperty("--review-font-scale", String(reviewFontScale));
  updateFontScaleButtons();
  applyFontScaleToOverviewFrame();
  if (persist) {
    localStorage.setItem(fontScaleStorageKey, String(reviewFontScale));
  }
}

function initializeReviewFontScale() {
  const stored = Number(localStorage.getItem(fontScaleStorageKey));
  setReviewFontScale(stored || 1, false);
}

function beginFontScaleEdit() {
  fontSizeInput.value = fontScaleLabel();
  fontSizeLabel.hidden = true;
  fontSizeInput.hidden = false;
  fontSizeInput.focus();
  fontSizeInput.select();
}

function finishFontScaleEdit(commit) {
  if (commit) {
    const parsedScale = parseFontScaleInput(fontSizeInput.value);
    if (parsedScale !== null) {
      setReviewFontScale(parsedScale);
    }
  }

  fontSizeInput.hidden = true;
  fontSizeLabel.hidden = false;
  updateFontScaleButtons();
}

function showHelpDialog() {
  if (!diffHelpDialog.open) {
    diffHelpDialog.showModal();
  }
}

function diffSideUnsafeCSS() {
  const rules = [
    ':host { font-size: calc(14px * var(--review-font-scale, 1)); }',
  ];
  if (diffStyle === "split" && !diffScrollLocked && diffSide === "both") {
    rules.push(
      ':host { display: block; height: 100%; min-height: 0; }',
      '[data-diff-type="split"][data-overflow="scroll"] { height: 100%; min-height: 0; overflow: hidden !important; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code] { align-content: start; box-sizing: border-box; height: 100%; min-height: 0; overflow: scroll !important; overscroll-behavior: contain; padding-right: 28px; scrollbar-color: color-mix(in srgb, var(--diffs-fg), transparent 72%) color-mix(in srgb, var(--diffs-bg), transparent 70%); scrollbar-gutter: stable; scrollbar-width: auto; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code]::-webkit-scrollbar { width: 12px !important; height: 12px !important; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code]::-webkit-scrollbar-track { background-color: color-mix(in srgb, var(--diffs-bg), transparent 70%) !important; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code]::-webkit-scrollbar-thumb { background-color: color-mix(in srgb, var(--diffs-fg), transparent 72%) !important; background-clip: content-box; border: 2px solid transparent; border-radius: 999px; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code]::-webkit-scrollbar-thumb:horizontal { min-width: 2rem; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code]::-webkit-scrollbar-thumb:vertical { min-height: 2rem; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code]::-webkit-scrollbar-corner { background-color: color-mix(in srgb, var(--diffs-bg), transparent 70%) !important; }',
      '[data-diff-type="split"][data-overflow="scroll"] > code[data-code] :is([data-content-buffer], [data-gutter-buffer="buffer"]) { display: none !important; }',
    );
  }
  if (diffSide === "left") {
    rules.push(
      '[data-diff-type="split"] { grid-template-columns: 1fr !important; }',
      'code[data-additions] { display: none !important; }',
      'code[data-deletions] :is([data-content-buffer], [data-gutter-buffer="buffer"]) { display: none !important; }',
      'code[data-unified] :is([data-line-type="change-addition"], [data-line-type="change-addition"] + [data-no-newline]) { display: none !important; }',
    );
  } else if (diffSide === "right") {
    rules.push(
      '[data-diff-type="split"] { grid-template-columns: 1fr !important; }',
      'code[data-deletions] { display: none !important; }',
      'code[data-additions] :is([data-content-buffer], [data-gutter-buffer="buffer"]) { display: none !important; }',
      'code[data-unified] :is([data-line-type="change-deletion"], [data-line-type="change-deletion"] + [data-no-newline]) { display: none !important; }',
    );
  }
  return rules.join("\n");
}

function resetDiffSurface({ clearCommentMarkers = true } = {}) {
  clearDiffCaret();
  clearDiffChangeRails();
  if (clearCommentMarkers) {
    clearDiffCommentMarkers();
  }
  clearDiffSelectionHighlights();
  hideEndPrompt();
  if (diffViewer) {
    diffViewer.cleanUp();
    diffViewer = null;
  }
}

function stopOverviewPolling() {
  if (overviewPollTimer) {
    clearTimeout(overviewPollTimer);
    overviewPollTimer = 0;
  }
}

function setOverviewSpinnerVisible(visible) {
  if (!overviewSpinner) {
    return;
  }
  overviewSpinner.classList.toggle("visible", visible);
}

function showPlainDiff(text) {
  stopOverviewPolling();
  setOverviewSpinnerVisible(false);
  mainPane.classList.remove("overview-mode");
  resetDiffSurface();
  diffView.classList.remove("reconnecting");
  diffView.classList.add("fallback");
  diffView.textContent = diffVisibleWhitespace ? makeWhitespaceVisible(text) : text;
}

function showOverviewPendingStatus(text) {
  mainPane.classList.remove("overview-mode");
  resetDiffSurface();
  diffTitle.textContent = "Overview";
  diffTitle.title = "Overview";
  diffView.classList.remove("reconnecting", "status-error");
  diffView.classList.add("fallback", "status-loading");
  diffView.textContent = diffVisibleWhitespace ? makeWhitespaceVisible(text) : text;
}

function showOverviewFrame(url) {
  setOverviewSpinnerVisible(false);
  mainPane.classList.add("overview-mode");
  resetDiffSurface();
  diffView.classList.remove("reconnecting", "fallback", "status-loading", "status-error");
  diffView.textContent = "";
  const frame = document.createElement("iframe");
  frame.className = "overview-frame";
  frame.src = url;
  frame.title = "Overview";
  frame.style.setProperty("zoom", String(reviewFontScale));
  diffView.append(frame);
}

let reconnecting = false;
let reconnectTimer = 0;

function showReconnecting(message = "Reconnecting to Code Review extension server...") {
  resetDiffSurface();
  diffView.classList.remove("fallback", "status-loading", "status-error");
  diffView.classList.add("reconnecting");
  diffView.textContent = message;
}

function startReconnect(reason = "server-restarting") {
  if (reconnecting) {
    return;
  }

  reconnecting = true;
  showReconnecting("Reconnecting...\n\nThe Code Review extension server is restarting.");
  const poll = async () => {
    try {
      const response = await fetch("/health", { cache: "no-store" });
      if (response.ok) {
        const health = await response.json();
        if (health.serverId && health.serverId !== initialServerId) {
          location.reload();
          return;
        }
      }
    } catch {
      // Expected while the extension host is between old and new server processes.
    }

    reconnectTimer = window.setTimeout(poll, 500);
  };

  reconnectTimer = window.setTimeout(poll, reason === "server-stopping" ? 250 : 0);
}

function connectLifecycleEvents() {
  const events = new EventSource("/events");
  events.addEventListener("server-stopping", () => {
    events.close();
    startReconnect("server-stopping");
  });
  events.onerror = () => {
    if (events.readyState === EventSource.CLOSED) {
      startReconnect("event-stream-closed");
    }
  };
}

function applyVisibleWhitespace() {
  if (!diffVisibleWhitespace) {
    return;
  }

  const textNodes = [];
  collectVisibleWhitespaceTextNodes(diffView, textNodes);

  for (const node of textNodes) {
    node.nodeValue = makeWhitespaceVisible(node.nodeValue);
  }
}

function collectVisibleWhitespaceTextNodes(root, textNodes) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (node) => {
      if (node instanceof Element && (node.localName === "style" || node.localName === "script")) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    },
  });
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      textNodes.push(node);
    } else if (node instanceof Element && node.shadowRoot) {
      collectVisibleWhitespaceTextNodes(node.shadowRoot, textNodes);
    }
  }
}

function showEndPrompt() {
  pendingEndPrompt = true;
  let prompt = diffView.querySelector(".diff-end-prompt");
  if (!prompt) {
    prompt = document.createElement("div");
    prompt.className = "diff-end-prompt";
    diffView.append(prompt);
  }
  prompt.textContent = "End of file. F8: next diff. Space: mark reviewed and next diff.";
}

function hideEndPrompt() {
  pendingEndPrompt = false;
  diffView.querySelector(".diff-end-prompt")?.remove();
}

function getDiffScrollNodes() {
  const container = diffView.querySelector("diffs-container");
  const root = container && container.shadowRoot;
  if (!root) {
    return {};
  }
  return {
    pre: root.querySelector("pre"),
    deletions: root.querySelector("code[data-deletions]"),
    additions: root.querySelector("code[data-additions]"),
  };
}

function clearDiffChangeRails() {
  if (diffRailCleanup) {
    diffRailCleanup();
    diffRailCleanup = null;
  }
  diffView.classList.remove("has-change-rail");
  diffView.querySelectorAll(".diff-change-rail").forEach((rail) => rail.remove());
}

function clearDiffCaret() {
  if (diffCaret) {
    diffCaret.remove();
    diffCaret = null;
  }
  diffCaretKey = null;
  diffCaretTop = null;
}

function getDiffRailTargets() {
  const { pre, deletions, additions } = getDiffScrollNodes();
  if (!pre) {
    return [];
  }

  const unified = pre.querySelector("code[data-unified]");
  if (unified) {
    return [{ scrollNode: diffView, markerRoots: [{ root: unified, lane: "both" }] }];
  }

  if (diffStyle !== "split") {
    return [];
  }

  if (!diffScrollLocked && diffSide === "both") {
    return [
      deletions && { scrollNode: deletions, markerRoots: [{ root: deletions, lane: "left" }] },
      additions && { scrollNode: additions, markerRoots: [{ root: additions, lane: "right" }] },
    ].filter(Boolean);
  }

  return [
    {
      scrollNode: diffView,
      markerRoots: [
        deletions && { root: deletions, lane: "left" },
        additions && { root: additions, lane: "right" },
      ].filter(Boolean),
    },
  ];
}

function createDiffChangeRail(target) {
  const rail = document.createElement("div");
  rail.className = "diff-change-rail";
  rail.innerHTML = '<div class="diff-change-rail-lane" data-rail-lane="left"></div><div class="diff-change-rail-lane" data-rail-lane="right"></div><div class="diff-change-rail-thumb"></div>';
  diffView.append(rail);

  const leftLane = rail.querySelector('[data-rail-lane="left"]');
  const rightLane = rail.querySelector('[data-rail-lane="right"]');
  const thumb = rail.querySelector(".diff-change-rail-thumb");
  const laneByName = { left: leftLane, right: rightLane };

  function updateLayout() {
    const viewRect = diffView.getBoundingClientRect();
    const scrollRect = target.scrollNode.getBoundingClientRect();
    const scrollbarWidth = Math.max(12, target.scrollNode.offsetWidth - target.scrollNode.clientWidth);
    const railWidth = rail.offsetWidth || 11;
    const top = Math.max(scrollRect.top, viewRect.top) - viewRect.top;
    const bottom = Math.min(scrollRect.bottom, viewRect.bottom) - viewRect.top;
    const height = Math.max(0, bottom - top);
    const railRight = Math.min(scrollRect.right, viewRect.right) - viewRect.left;
    const railLeft = railRight - scrollbarWidth - railWidth - 3;

    (rail as HTMLElement).style.top = diffView.scrollTop + top + "px";
    (rail as HTMLElement).style.left = diffView.scrollLeft + Math.max(0, railLeft) + "px";
    (rail as HTMLElement).style.height = height + "px";

    const scrollHeight = Math.max(target.scrollNode.scrollHeight, 1);
    const scrollTop = target.scrollNode.scrollTop;
    const clientHeight = Math.max(target.scrollNode.clientHeight, 1);
    (thumb as HTMLElement).style.setProperty("--thumb-top", Math.max(0, Math.min(1, scrollTop / scrollHeight)) * 100 + "%");
    (thumb as HTMLElement).style.setProperty("--thumb-height", Math.max(0.06, Math.min(1, clientHeight / scrollHeight)) * 100 + "%");
  }

  function addMarker(laneName, row, color) {
    const marker = document.createElement("span");
    const scrollRect = target.scrollNode.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    const scrollHeight = Math.max(target.scrollNode.scrollHeight, 1);
    const top = (rowRect.top - scrollRect.top + target.scrollNode.scrollTop) / scrollHeight;
    const height = Math.max(0.004, rowRect.height / scrollHeight);
    marker.className = "diff-change-rail-marker";
    marker.style.setProperty("--marker-top", Math.max(0, Math.min(1, top)) * 100 + "%");
    marker.style.setProperty("--marker-height", Math.min(1, height) * 100 + "%");
    marker.style.setProperty("--marker-color", color);
    laneByName[laneName].append(marker);
  }

  for (const { root, lane } of target.markerRoots) {
    const deletionRows = root.querySelectorAll('[data-gutter] > [data-line-type="change-deletion"]');
    const additionRows = root.querySelectorAll('[data-gutter] > [data-line-type="change-addition"]');
    if (lane === "left" || lane === "both") {
      deletionRows.forEach((row) => addMarker("left", row, "rgba(207, 34, 46, 0.88)"));
    }
    if (lane === "right" || lane === "both") {
      additionRows.forEach((row) => addMarker("right", row, "rgba(26, 127, 55, 0.88)"));
    }
  }

  return { rail, updateLayout };
}

function installDiffChangeRails() {
  clearDiffChangeRails();
}

function getDiffChangeBlocks() {
  const container = diffView.querySelector("diffs-container");
  const root = container && container.shadowRoot;
  if (!root) {
    return [];
  }

  const rows = Array.from(root.querySelectorAll('[data-gutter] > [data-line-type="change-deletion"], [data-gutter] > [data-line-type="change-addition"]'))
    .filter((row) => row.getClientRects().length > 0);
  const rowData = rows.map((row) => {
    const code = row.closest("code[data-code]");
    const scrollNode = code && code.scrollHeight > code.clientHeight + 1 ? code : diffView;
    const scrollRect = scrollNode.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();
    return {
      row,
      scrollNode,
      key: row.getAttribute("data-line-index") || "",
      top: rowRect.top - scrollRect.top + scrollNode.scrollTop,
      bottom: rowRect.bottom - scrollRect.top + scrollNode.scrollTop,
    };
  }).sort((left, right) => left.top - right.top || left.bottom - right.bottom);

  const blocks = [];
  for (const item of rowData) {
    const last = blocks[blocks.length - 1];
    if (last && item.scrollNode === last.scrollNode && item.top <= last.bottom + 4) {
      last.bottom = Math.max(last.bottom, item.bottom);
      if (item.key && !last.key.includes(item.key)) {
        last.key += "|" + item.key;
      }
      continue;
    }
    blocks.push({ ...item });
  }
  return blocks;
}

function getDiffRows() {
  const container = diffView.querySelector("diffs-container");
  const root = container && container.shadowRoot;
  if (!root) {
    return [];
  }

  return Array.from(root.querySelectorAll('[data-gutter] > [data-line-index]'))
    .filter((row) => row.getClientRects().length > 0)
    .map((row) => {
      const code = row.closest("code[data-code]");
      const scrollNode = code && code.scrollHeight > code.clientHeight + 1 ? code : diffView;
      const scrollRect = scrollNode.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      return {
        row,
        code,
        scrollNode,
        key: row.getAttribute("data-line-index") || "",
        top: rowRect.top - scrollRect.top + scrollNode.scrollTop,
        bottom: rowRect.bottom - scrollRect.top + scrollNode.scrollTop,
        rect: rowRect,
        codeRect: code ? code.getBoundingClientRect() : scrollRect,
      };
    });
}

function clearDiffCommentMarkers() {
  for (const marker of diffCommentMarkers) {
    marker.remove();
  }
  diffCommentMarkers = [];
}

function lineNumberFromRow(row) {
  for (const name of ["data-line-number", "data-line", "aria-label"]) {
    const value = row.getAttribute(name) || "";
    const match = value.match(/\\d+/);
    if (match) {
      return match[0];
    }
  }

  const text = (row.textContent || "").trim();
  const match = text.match(/\\d+/);
  return match ? match[0] : "";
}

function lineSideFromRow(row) {
  const lineType = row.getAttribute("data-line-type") || "";
  if (lineType.includes("deletion")) {
    return "left";
  }
  if (lineType.includes("addition")) {
    return "right";
  }
  return "context";
}

function selectedDiffText() {
  const selection = getDiffSelection();
  return selection ? selection.toString().trim() : "";
}

function getDiffSelection() {
  const container = diffView.querySelector("diffs-container");
  const root = container && container.shadowRoot;
  const shadowSelection = root && "getSelection" in root && typeof root.getSelection === "function" ? root.getSelection() : null;
  if (shadowSelection && shadowSelection.rangeCount && shadowSelection.toString().trim()) {
    return shadowSelection;
  }

  return window.getSelection && window.getSelection();
}

function rectanglesIntersect(left, right) {
  return left.right >= right.left && left.left <= right.right && left.bottom >= right.top && left.top <= right.bottom;
}

function selectionRectIntersectsDiffRow(selectionRect, row) {
  return selectionRect.bottom >= row.rect.top
    && selectionRect.top <= row.rect.bottom
    && selectionRect.right >= row.codeRect.left
    && selectionRect.left <= row.codeRect.right;
}

function diffRowsForCurrentSelection() {
  const selection = getDiffSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
    return [];
  }

  const selectionRects = Array.from(selection.getRangeAt(0).getClientRects());
  if (!selectionRects.length) {
    return [];
  }

  return getDiffRows().filter((row) => selectionRects.some((rect) => selectionRectIntersectsDiffRow(rect, row)));
}

function selectionRangeFromRows(rows) {
  const selection = getDiffSelection();
  const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!rows.length) {
    return {
      selectionStartLineKey: "",
      selectionEndLineKey: "",
      selectionStartLineNumber: "",
      selectionEndLineNumber: "",
      selectionStartColumn: "",
      selectionEndColumn: "",
      selectionStartLineSide: "",
      selectionEndLineSide: "",
    };
  }

  const first = rows[0];
  const last = rows[rows.length - 1];
  const selectedText = selectedDiffText();
  const selectedLines = selectedText.split(/\r?\n/);
  const fallbackStartColumn = selectedText ? "1" : "";
  const fallbackEndColumn = selectedText ? String(Math.max(1, selectedLines[selectedLines.length - 1].length + 1)) : "";
  const startColumn = range ? columnOffsetInRow(first.row, range.startContainer, range.startOffset) || fallbackStartColumn : fallbackStartColumn;
  const endColumn = range
    ? columnOffsetInRow(last.row, range.endContainer, range.endOffset) || fallbackEndColumn
    : fallbackEndColumn;
  return {
    selectionStartLineKey: first.key || "",
    selectionEndLineKey: last.key || "",
    selectionStartLineNumber: lineNumberFromRow(first.row),
    selectionEndLineNumber: lineNumberFromRow(last.row),
    selectionStartColumn: startColumn,
    selectionEndColumn: endColumn,
    selectionStartLineSide: lineSideFromRow(first.row),
    selectionEndLineSide: lineSideFromRow(last.row),
  };
}

function columnOffsetInRow(row, container, offset) {
  if (!row || !container || !row.contains(container)) {
    return "";
  }

  try {
    const range = document.createRange();
    range.selectNodeContents(row);
    range.setEnd(container, offset);
    return String(Math.max(1, range.toString().length + 1));
  } catch {
    return "";
  }
}

function clearDiffSelectionHighlights() {
  for (const highlight of diffSelectionHighlights) {
    highlight.remove();
  }
  diffSelectionHighlights = [];
}

function preserveCurrentDiffSelectionHighlight() {
  clearDiffSelectionHighlights();
  const selection = getDiffSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount || !selection.toString().trim()) {
    return;
  }

  const viewRect = diffView.getBoundingClientRect();
  for (const rect of selection.getRangeAt(0).getClientRects()) {
    const left = diffView.scrollLeft + rect.left - viewRect.left;
    const top = diffView.scrollTop + rect.top - viewRect.top;
    if (rect.width <= 0 || rect.height <= 0) {
      continue;
    }

    const highlight = document.createElement("div");
    highlight.className = "diff-selection-highlight";
    highlight.style.left = left + "px";
    highlight.style.top = top + "px";
    highlight.style.width = rect.width + "px";
    highlight.style.height = rect.height + "px";
    diffView.append(highlight);
    diffSelectionHighlights.push(highlight);
  }
}

function commentTargetFromDiffRow(rowData, selectedRowsOverride = null) {
  const row = rowData.row;
  const selectedCode = selectedDiffText();
  const selectedRows = selectedRowsOverride || (selectedCode ? diffRowsForCurrentSelection() : []);
  return {
    reviewCommitSha,
    branch: loadedBranch,
    baseline: loadedBaseline,
    rangeText: rangeText.value,
    filePath: selectedFile,
    lineKey: row.getAttribute("data-line-index") || rowData.key || "",
    lineNumber: lineNumberFromRow(row),
    lineSide: lineSideFromRow(row),
    codeLine: selectedRows.length ? selectedRows.map((selectedRow) => (selectedRow.row.textContent || "").trim()).join("\n") : (row.textContent || "").trim(),
    selectedCode,
    ...selectionRangeFromRows(selectedRows),
  };
}

function commentTargetLabel(target) {
  if (!target) {
    return "Select a diff line to comment.";
  }
  const hasSelectionRange = target.selectionStartLineNumber && target.selectionEndLineNumber;
  const line = hasSelectionRange
    ? ":" + target.selectionStartLineNumber + (target.selectionStartColumn ? ":" + target.selectionStartColumn : "") + "-" + target.selectionEndLineNumber + (target.selectionEndColumn ? ":" + target.selectionEndColumn : "")
    : (target.lineNumber ? ":" + target.lineNumber : "");
  const side = target.lineSide && target.lineSide !== "context" ? " (" + target.lineSide + ")" : "";
  return target.filePath + line + side;
}

function renderCommentComposer() {
  const hasTarget = Boolean(currentCommentTarget && currentCommentTarget.filePath);
  commentComposer.classList.toggle("visible", hasTarget);
  commentContext.textContent = commentTargetLabel(currentCommentTarget);
  commentsTarget.textContent = hasTarget ? "New comment at " + commentTargetLabel(currentCommentTarget) : "Select a diff line to comment.";
}

function prepareCommentForRow(rowData) {
  clearDiffSelectionHighlights();
  currentCommentTarget = commentTargetFromDiffRow(rowData);
  renderCommentComposer();
}

function renderCommentsPane() {
  commentsTitle.textContent = "Comments" + (currentComments.length ? " (" + currentComments.length + ")" : "");
  if (!currentCommentTarget) {
    commentsTarget.textContent = selectedFile ? "Showing all comments · current file: " + selectedFile : "Showing all comments.";
  }
  commentsList.textContent = "";
  if (!currentComments.length) {
    const empty = document.createElement("p");
    empty.textContent = "No local comments yet.";
    commentsList.append(empty);
    return;
  }

  for (const comment of currentComments) {
    const item = document.createElement("article");
    item.className = "comment-item";
    item.dataset.commentId = comment.id;
    const meta = document.createElement("div");
    meta.className = "comment-meta";
    meta.textContent = commentTargetLabel(comment) + " · " + new Date(comment.createdAt).toLocaleString();
    const text = document.createElement("div");
    text.className = "comment-text";
    text.textContent = comment.body;
    item.append(meta, text);
    if (comment.selectedCode || comment.codeLine) {
      const code = document.createElement("div");
      code.className = "comment-code";
      code.textContent = comment.selectedCode || comment.codeLine;
      item.append(code);
    }
    item.addEventListener("click", () => scrollToComment(comment));
    commentsList.append(item);
  }
}

function matchingRowForComment(comment) {
  const rows = getDiffRows();
  if (!rows.length) {
    return null;
  }

  return rows.find((row) => row.key && row.key === comment.lineKey)
    || rows.find((row) => comment.lineNumber && lineNumberFromRow(row.row) === comment.lineNumber && lineSideFromRow(row.row) === comment.lineSide)
    || rows.find((row) => comment.lineNumber && lineNumberFromRow(row.row) === comment.lineNumber)
    || rows[0];
}

function renderInlineComments() {
  clearDiffCommentMarkers();
  const fileComments = currentComments.filter((comment) => comment.filePath === selectedFile);
  if (!fileComments.length) {
    return;
  }

  const viewRect = diffView.getBoundingClientRect();
  for (const comment of fileComments) {
    const row = matchingRowForComment(comment);
    if (!row) {
      continue;
    }

    const rowRect = row.row.getBoundingClientRect();
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "diff-comment-marker";
    marker.textContent = "💬";
    marker.title = comment.body;
    marker.style.top = diffView.scrollTop + rowRect.top - viewRect.top + rowRect.height / 2 + "px";
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      scrollToComment(comment);
    });
    diffView.append(marker);
    diffCommentMarkers.push(marker);
  }
}

function scrollToComment(comment) {
  if (comment.filePath && comment.filePath !== selectedFile) {
    const file = currentFiles.find((candidate) => candidate.path === comment.filePath);
    if (file) {
      selectedFile = file.path;
      selectedTreePath = selectedFile;
      updateSelectedFileInTree();
      updateReviewedToggle();
      loadSelectedFileDiff({ diffNavigation: false });
    }
  }
  const row = matchingRowForComment(comment);
  if (row) {
    selectDiffBlock(row);
  }
  const item = commentsList.querySelector('[data-comment-id="' + comment.id + '"]');
  if (item) {
    item.scrollIntoView({ block: "nearest" });
  }
}

async function loadLocalComments() {
  const loadVersion = ++commentsLoadVersion;
  const response = await fetch("/local-comments");
  if (loadVersion !== commentsLoadVersion) {
    return;
  }
  if (!response.ok) {
    throw new Error(await response.text());
  }
  const data = await response.json();
  currentComments = data.comments || [];
  renderCommentComposer();
  renderCommentsPane();
  renderInlineComments();
}

async function saveCurrentComment() {
  if (!currentCommentTarget) {
    return;
  }
  const body = commentBody.value.trim();
  if (!body) {
    return;
  }

  commentSaveButton.disabled = true;
  try {
    const response = await fetch("/local-comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentCommentTarget, body }),
    });
    if (!response.ok) {
      throw new Error(await response.text());
    }
    commentBody.value = "";
    currentCommentTarget = null;
    await loadLocalComments();
  } finally {
    commentSaveButton.disabled = false;
  }
}

function scrollToDiffBlock(block) {
  const viewportTop = block.scrollNode.scrollTop;
  const viewportBottom = viewportTop + block.scrollNode.clientHeight;
  if (block.top >= viewportTop && block.bottom <= viewportBottom) {
    return;
  }

  const lineHeight = Math.max(1, block.row.getBoundingClientRect().height || 16);
  const contextHeight = lineHeight * 5;
  const maxScrollTop = Math.max(0, block.scrollNode.scrollHeight - block.scrollNode.clientHeight);
  block.scrollNode.scrollTo({
    top: Math.max(0, Math.min(maxScrollTop, block.top - contextHeight)),
    behavior: "auto",
  });
}

function positionDiffCaretAt(target) {
  if (!target) {
    clearDiffCaret();
    diffCaretKey = null;
    diffCaretTop = null;
    return;
  }
  if (!diffCaret) {
    diffCaret = document.createElement("div");
    diffCaret.className = "diff-caret";
    diffView.append(diffCaret);
  }

  const viewRect = diffView.getBoundingClientRect();
  const scrollRect = target.scrollNode.getBoundingClientRect();
  const top = scrollRect.top - viewRect.top + target.top - target.scrollNode.scrollTop;
  const left = scrollRect.left - viewRect.left + target.scrollNode.scrollLeft + 4;
  diffCaret.style.top = diffView.scrollTop + Math.max(0, top - 1) + "px";
  diffCaret.style.left = diffView.scrollLeft + Math.max(0, left) + "px";
  diffCaretKey = target.key ? selectedFile + "::" + target.key : null;
  diffCaretTop = target.top;
}

function positionDiffCaret(block) {
  positionDiffCaretAt(block);
}

function selectDiffBlock(block) {
  hideEndPrompt();
  scrollToDiffBlock(block);
  positionDiffCaret(block);
}

function currentDiffBlockIndex(blocks) {
  if (!diffCaretKey) {
    return -1;
  }
  return blocks.findIndex((block) => selectedFile + "::" + block.key === diffCaretKey);
}

function positionCurrentDiffCaret() {
  const rows = getDiffRows();
  const row = diffCaretKey && rows.find((candidate) => selectedFile + "::" + candidate.key === diffCaretKey);
  if (row) {
    positionDiffCaretAt(row);
    return;
  }

  const blocks = getDiffChangeBlocks();
  const index = currentDiffBlockIndex(blocks);
  if (index < 0) {
    clearDiffCaret();
    return;
  }
  positionDiffCaret(blocks[index]);
}

function scrollToDiffInCurrentFile(direction) {
  const blocks = getDiffChangeBlocks();
  if (!blocks.length) {
    return false;
  }

  if (direction === "first") {
    selectDiffBlock(blocks[0]);
    return true;
  }
  if (direction === "last") {
    selectDiffBlock(blocks[blocks.length - 1]);
    return true;
  }

  const index = currentDiffBlockIndex(blocks);
  const caretTop = diffCaretTop == null ? null : diffCaretTop;
  const block = direction === "next"
    ? (caretTop == null ? blocks[index + 1] || (index < 0 ? blocks[0] : null) : blocks.find((candidate) => candidate.top > caretTop + 4))
    : (caretTop == null ? blocks[index - 1] || (index < 0 ? blocks[blocks.length - 1] : null) : blocks.findLast((candidate) => candidate.top < caretTop - 4));
  if (!block) {
    return false;
  }
  selectDiffBlock(block);
  return true;
}

function moveCaretToClickedDiffLine(event) {
  if (suppressNextDiffClick) {
    suppressNextDiffClick = false;
    return;
  }
  if (selectedDiffText()) {
    return;
  }

  const row = diffRowFromPoint(event.clientX, event.clientY);
  if (row) {
    positionDiffCaretAt(row);
    prepareCommentForRow(row);
  }
}

function diffRowFromPoint(clientX, clientY) {
  const rows = getDiffRows();
  return rows.find((candidate) => {
    const rect = candidate.codeRect;
    return clientX >= rect.left && clientX <= rect.right && clientY >= candidate.rect.top && clientY <= candidate.rect.bottom;
  });
}

function prepareCommentForSelectedDiffText(event = null) {
  const selectedCode = selectedDiffText();
  if (!selectedCode) {
    return;
  }

  let rows = diffRowsForCurrentSelection();
  if (!rows.length && event) {
    const row = diffRowFromPoint(event.clientX, event.clientY);
    if (row) {
      rows = [row];
    }
  }
  if (!rows.length) {
    return;
  }

  suppressNextDiffClick = true;
  positionDiffCaretAt(rows[0]);
  preserveCurrentDiffSelectionHighlight();
  currentCommentTarget = commentTargetFromDiffRow(rows[0], rows);
  renderCommentComposer();
}

async function navigateDiff(direction, options: DiffNavigationOptions = {}) {
  if (scrollToDiffInCurrentFile(direction)) {
    return;
  }

  if (direction === "next" && selectedFile && !reviewedPaths.has(selectedFile) && !options.forceCrossFile && !pendingEndPrompt) {
    showEndPrompt();
    return;
  }

  hideEndPrompt();

  const selectedIndex = currentFiles.findIndex((file) => file.path === selectedFile);
  const nextIndex = direction === "next" ? selectedIndex + 1 : selectedIndex - 1;
  if (nextIndex < 0 || nextIndex >= currentFiles.length) {
    return;
  }

  selectedFile = currentFiles[nextIndex].path;
  selectedTreePath = selectedFile;
  updateReviewedToggle();
  await loadSelectedFileDiff({ diffNavigation: direction === "next" ? "first" : "last" });
}

function applyDiffScrollLock() {
  const scrollSyncManager = diffViewer && diffViewer.scrollSyncManager;
  if (!scrollSyncManager) {
    return;
  }

  const { pre, deletions, additions } = getDiffScrollNodes();
  if (diffScrollLocked && diffStyle === "split" && pre && deletions && additions) {
    scrollSyncManager.setup(pre, deletions, additions);
  } else {
    scrollSyncManager.cleanUp();
  }
  requestAnimationFrame(installDiffChangeRails);
}

async function renderDiff(diff, fileName) {
  const renderVersion = ++diffRenderVersion;
  if (!diff) {
    showPlainDiff("No diff to show.");
    return;
  }

  diffView.classList.remove("fallback");
  diffView.classList.remove("status-loading", "status-error");
  resetDiffSurface({ clearCommentMarkers: false });
  diffView.textContent = "";

  try {
    const { FileDiff, parsePatchFiles } = await loadPierreDiffs();
    if (renderVersion !== diffRenderVersion) {
      return;
    }

    const parsedPatches = parsePatchFiles(diff, fileName || "selected-file", false);
    const fileDiff = parsedPatches[0] && parsedPatches[0].files && parsedPatches[0].files[0];
    if (!fileDiff) {
      showPlainDiff("Could not parse rich diff for " + (fileName || "selected file") + ".");
      diffView.classList.add("status-error");
      return;
    }

    if (diffViewer) {
      diffViewer.cleanUp();
    }
    diffViewer = new FileDiff({
      disableFileHeader: true,
      diffStyle,
      expandUnchanged: true,
      hunkSeparators: "line-info-basic",
      lineHoverHighlight: true,
      onPostRender: () => applyDiffScrollLock(),
      theme: window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "github-dark" : "github-light",
      unsafeCSS: diffSideUnsafeCSS(),
    });
    diffView.textContent = "";
    diffViewer.render({ fileDiff, containerWrapper: diffView, forceRender: true });
    applyVisibleWhitespace();
    applyDiffScrollLock();
    requestAnimationFrame(positionCurrentDiffCaret);
    requestAnimationFrame(renderInlineComments);
  } catch (error) {
    setRangeStatus("Could not render rich diff.", "error");
    console.error(error);
  }
}

function applyLeftPaneLayout() {
  reviewPanelBody.style.setProperty("--left-pane-width", (leftPaneCollapsed ? 0 : leftPaneWidth) + "px");
}

function applyCommentsLayout() {
  mainPane.classList.toggle("comments-collapsed", commentsCollapsed);
  mainPane.style.setProperty("--comments-height", commentsHeight + "px");
}

function clampLeftPaneWidth(width, containerWidth) {
  const maxWidth = Math.max(160, containerWidth - 320);
  return Math.max(160, Math.min(maxWidth, width));
}

function clampCommentsHeight(height, containerHeight) {
  const maxHeight = Math.max(112, containerHeight - 200);
  return Math.max(112, Math.min(maxHeight, height));
}

function applySelectionLayout(visible) {
  if (visible) {
    leftPane.classList.add("selection-visible");
    leftPane.style.setProperty("--selection-height", selectionHeight + "px");
    splitter.style.display = "block";
  } else {
    leftPane.classList.remove("selection-visible");
    splitter.style.display = "none";
  }
}

function updateRangeToggleText() {
  const expanded = rangeToggle.getAttribute("aria-expanded") === "true";
  const availableCount = checklist.querySelectorAll(".picker-row").length;
  const selectedCount = checklist.querySelectorAll(".picker-row.in-range").length;
  rangeToggle.textContent = (expanded ? "hide selection" : "show selection") + " (" + selectedCount + " out of " + availableCount + ")";
}

splitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  splitter.setPointerCapture(event.pointerId);
  const rect = leftPane.getBoundingClientRect();
  const onMove = (moveEvent) => {
    selectionHeight = Math.max(96, Math.min(rect.height - 96, moveEvent.clientY - rect.top));
    leftPane.style.setProperty("--selection-height", selectionHeight + "px");
  };
  const onUp = (upEvent) => {
    splitter.releasePointerCapture(upEvent.pointerId);
    splitter.removeEventListener("pointermove", onMove);
    splitter.removeEventListener("pointerup", onUp);
    splitter.removeEventListener("pointercancel", onUp);
  };
  splitter.addEventListener("pointermove", onMove);
  splitter.addEventListener("pointerup", onUp);
  splitter.addEventListener("pointercancel", onUp);
});

mainSplitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  mainSplitter.setPointerCapture(event.pointerId);
  const rect = reviewPanelBody.getBoundingClientRect();
  const onMove = (moveEvent) => {
    leftPaneCollapsed = false;
    leftPaneWidth = clampLeftPaneWidth(moveEvent.clientX - rect.left, rect.width);
    applyLeftPaneLayout();
  };
  const onUp = (upEvent) => {
    mainSplitter.releasePointerCapture(upEvent.pointerId);
    mainSplitter.removeEventListener("pointermove", onMove);
    mainSplitter.removeEventListener("pointerup", onUp);
    mainSplitter.removeEventListener("pointercancel", onUp);
  };
  mainSplitter.addEventListener("pointermove", onMove);
  mainSplitter.addEventListener("pointerup", onUp);
  mainSplitter.addEventListener("pointercancel", onUp);
});

mainSplitter.addEventListener("dblclick", () => {
  leftPaneCollapsed = !leftPaneCollapsed;
  applyLeftPaneLayout();
});

commentsSplitter.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  commentsSplitter.setPointerCapture(event.pointerId);
  const rect = mainPane.getBoundingClientRect();
  const onMove = (moveEvent) => {
    commentsCollapsed = false;
    commentsHeight = clampCommentsHeight(rect.bottom - moveEvent.clientY, rect.height);
    applyCommentsLayout();
  };
  const onUp = (upEvent) => {
    commentsSplitter.releasePointerCapture(upEvent.pointerId);
    commentsSplitter.removeEventListener("pointermove", onMove);
    commentsSplitter.removeEventListener("pointerup", onUp);
    commentsSplitter.removeEventListener("pointercancel", onUp);
  };
  commentsSplitter.addEventListener("pointermove", onMove);
  commentsSplitter.addEventListener("pointerup", onUp);
  commentsSplitter.addEventListener("pointercancel", onUp);
});

commentsSplitter.addEventListener("dblclick", () => {
  commentsCollapsed = !commentsCollapsed;
  applyCommentsLayout();
});

applyLeftPaneLayout();
applyCommentsLayout();

function updateDiffModeButtons() {
  for (const button of diffLayoutButtons) {
    const active = button.dataset.diffStyle === diffStyle;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  for (const button of diffSideButtons) {
    const active = button.dataset.diffSide === diffSide;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  diffScrollLockButton.classList.toggle("active", diffScrollLocked);
  diffScrollLockButton.setAttribute("aria-pressed", String(diffScrollLocked));
  diffScrollLockButton.setAttribute("aria-label", diffScrollLocked ? "Unlock SxS scroll sync" : "Lock SxS scroll sync");
  diffScrollLockButton.title = diffScrollLocked ? "SxS scroll sync locked" : "SxS scroll sync unlocked";
  diffScrollLockButton.querySelector(".lock-shackle").setAttribute(
    "d",
    diffScrollLocked ? "M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" : "M5.5 7V5.25a2.5 2.5 0 0 1 4.75-1.09",
  );
  diffIgnoreWhitespaceButton.classList.toggle("active", diffIgnoreWhitespace);
  diffIgnoreWhitespaceButton.setAttribute("aria-pressed", String(diffIgnoreWhitespace));
  diffVisibleWhitespaceButton.classList.toggle("active", diffVisibleWhitespace);
  diffVisibleWhitespaceButton.setAttribute("aria-pressed", String(diffVisibleWhitespace));
}

for (const button of diffLayoutButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.diffStyle === diffStyle) {
      return;
    }
    diffStyle = button.dataset.diffStyle;
    updateDiffModeButtons();
    renderDiff(currentDiff, selectedFile);
  });
}

for (const button of diffSideButtons) {
  button.addEventListener("click", () => {
    if (button.dataset.diffSide === diffSide) {
      return;
    }
    diffSide = button.dataset.diffSide;
    updateDiffModeButtons();
    renderDiff(currentDiff, selectedFile);
  });
}

diffScrollLockButton.addEventListener("click", () => {
  diffScrollLocked = !diffScrollLocked;
  updateDiffModeButtons();
  renderDiff(currentDiff, selectedFile);
});

diffIgnoreWhitespaceButton.addEventListener("click", () => {
  diffIgnoreWhitespace = !diffIgnoreWhitespace;
  updateDiffModeButtons();
  loadDiffData({ preserveSelectedFile: true });
});

diffVisibleWhitespaceButton.addEventListener("click", () => {
  diffVisibleWhitespace = !diffVisibleWhitespace;
  updateDiffModeButtons();
  renderDiff(currentDiff, selectedFile);
});

fontSizeDecreaseButton.addEventListener("click", () => {
  setReviewFontScale(getDecreasedFontScale());
});

fontSizeLabel.addEventListener("click", beginFontScaleEdit);

fontSizeInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.code === "Enter" || event.keyCode === 13) {
    event.preventDefault();
    event.stopPropagation();
    finishFontScaleEdit(true);
    fontSizeLabel.focus();
    return;
  }

  if (event.key === "Escape" || event.code === "Escape" || event.keyCode === 27) {
    event.preventDefault();
    event.stopPropagation();
    finishFontScaleEdit(false);
    fontSizeLabel.focus();
  }
});

fontSizeInput.addEventListener("blur", () => {
  finishFontScaleEdit(true);
});

fontSizeIncreaseButton.addEventListener("click", () => {
  setReviewFontScale(reviewFontScale + fontScaleStep);
});

diffHelpButton.addEventListener("click", showHelpDialog);

updateDiffModeButtons();

expandRange.addEventListener("change", () => {
  checklist.classList.toggle("expanded", expandRange.checked);
});

rangeToggle.addEventListener("click", () => {
  const expanded = rangeToggle.getAttribute("aria-expanded") === "true";
  rangeToggle.setAttribute("aria-expanded", String(!expanded));
  updateRangeToggleText();
  rangeList.classList.toggle("visible", !expanded);
  applySelectionLayout(!expanded);
});

applySelectionLayout(false);
updateRangeToggleText();

function markInputsValid() {
  baselineText.classList.remove("invalid");
  rangeText.classList.remove("invalid");
}

function updateRangeClearButton() {
  rangeClearButton.classList.toggle("visible", Boolean(rangeText.value));
}

function clearReviewedState(options: ClearReviewedStateOptions = {}) {
  reviewCommitSha = "";
  reviewKeysByFile = {};
  reviewedStateReady = false;
  reviewedPaths.clear();
  updateReviewedToggle();
  if (options.updateTree !== false) {
    updateReviewedStateInTree();
  }
}

function renderCommitRows(entries, selectedIds) {
  currentEntries = entries || [];
  const selected = new Set(selectedIds || []);
  const selectedList = selectedIds || [];
  const selectedFirst = selectedList[0];
  const selectedLast = selectedList[selectedList.length - 1];
  checklist.innerHTML = "";
  for (const entry of entries) {
    const row = document.createElement("div");
    row.className = "picker-row" + (entry.kind === "worktree" ? " worktree" : " commit");
    row.dataset.uiSection = "review-row";
    row.dataset.uiLabel = entry.title;
    row.dataset.uiDetail = entry.subtitle || "";
    const commitNumber = entry.index == null ? null : entry.index + 1;
    row.dataset.index = commitNumber == null ? "" : commitNumber;
    row.dataset.rangeValue = entry.kind === "commit" ? String(commitNumber) : "WORKTREE";
    row.innerHTML = '<span class="row-content"><span class="row-title"></span><span class="row-subtitle"></span></span>';
    row.querySelector(".row-title").textContent = entry.kind === "commit" && commitNumber !== null ? commitNumber + "  " + entry.title : entry.title;
    row.querySelector(".row-subtitle").textContent = entry.subtitle || "";
    row.classList.toggle("in-range", selected.has(entry.id));
    row.classList.toggle("range-start-edge", entry.id === selectedFirst);
    row.classList.toggle("range-end-edge", entry.id === selectedLast);
    row.addEventListener("click", (event) => {
      const value = row.dataset.rangeValue;
      if (event.ctrlKey || event.metaKey) {
        const anchor = rangeAnchor != null ? rangeAnchor : rangeText.value.split("..")[0] || value;
        rangeText.value = orderedRangeText(anchor, value);
      } else {
        rangeAnchor = value;
        rangeText.value = value;
      }
      updateRangeClearButton();
      updateChecklistSelectionFromRangeText();
      deferRangeInputsUntilAfterSelectionPaint();
    });
    checklist.appendChild(row);
  }
  updateRangeToggleText();
}

function rangeValueSortRank(value) {
  if ((value || "").toUpperCase() === "WORKTREE") {
    return Number.POSITIVE_INFINITY;
  }

  return /^\\d+$/.test(value) ? Number(value) : null;
}

function orderedRangeText(left, right) {
  const leftRank = rangeValueSortRank(left);
  const rightRank = rangeValueSortRank(right);
  if (leftRank !== null && rightRank !== null && rightRank < leftRank) {
    return right + ".." + left;
  }

  return left + ".." + right;
}

function entryIdForRangeValue(value) {
  const entry = currentEntries.find((candidate) => {
    const rangeValue = candidate.kind === "commit" ? String(candidate.index + 1) : "WORKTREE";
    return rangeValue === value;
  });
  return entry?.id || "";
}

function selectedIdsFromRangeText() {
  const text = rangeText.value.trim();
  if (!text) {
    return currentEntries.filter((entry) => entry.kind === "commit").map((entry) => entry.id);
  }

  const parts = text.split("..");
  const left = parts[0]?.trim();
  const right = parts.length === 1 ? left : (parts[1]?.trim() || "WORKTREE");
  if (!left || !right) {
    return [];
  }

  const leftNumber = /^\\d+$/.test(left) ? Number(left) : null;
  const rightNumber = /^\\d+$/.test(right) ? Number(right) : null;
  if (leftNumber !== null && rightNumber !== null) {
    const first = Math.min(leftNumber, rightNumber);
    const last = Math.max(leftNumber, rightNumber);
    return currentEntries
      .filter((entry) => entry.kind === "commit" && entry.index + 1 >= first && entry.index + 1 <= last)
      .map((entry) => entry.id);
  }

  if (leftNumber !== null && right.toUpperCase() === "WORKTREE") {
    return currentEntries
      .filter((entry) => entry.kind === "worktree" || (entry.kind === "commit" && entry.index + 1 >= leftNumber))
      .map((entry) => entry.id);
  }

  const selected = [];
  const leftId = entryIdForRangeValue(left);
  const rightId = entryIdForRangeValue(right);
  if (leftId) {
    selected.push(leftId);
  }
  if (rightId && rightId !== leftId) {
    selected.push(rightId);
  }
  return selected;
}

function updateChecklistSelectionFromRangeText() {
  const selectedIds = selectedIdsFromRangeText();
  const selected = new Set(selectedIds);
  const selectedFirst = selectedIds[0];
  const selectedLast = selectedIds[selectedIds.length - 1];
  for (const row of checklist.querySelectorAll<HTMLElement>(".picker-row")) {
    const id = entryIdForRangeValue(row.dataset.rangeValue || "");
    row.classList.toggle("in-range", selected.has(id));
    row.classList.toggle("range-start-edge", id === selectedFirst);
    row.classList.toggle("range-end-edge", id === selectedLast);
  }
  updateRangeToggleText();
}

function updateRangeAnchorFromText() {
  const parts = rangeText.value.split("..");
  const start = parts[0] ? parts[0].trim() : "";
  if (start) {
    rangeAnchor = start;
  } else {
    rangeAnchor = null;
  }
}

function applyRangeInputs(options: RangeInputOptions = {}) {
  markInputsValid();
  updateRangeAnchorFromText();
  updateRangeClearButton();
  clearReviewedState();
  clearStaleFileTree("Loading files...", { clearSelection: false });
  clearStaleDiff("Loading selection...", { clearSelection: false });
  loadDiffData({ ...options, preserveSelectedFile: true });
}

function deferRangeInputsUntilAfterSelectionPaint(options: RangeInputOptions = {}) {
  clearTimeout(rangeInputTimer);
  rangeInputTimer = null;
  markInputsValid();
  updateRangeAnchorFromText();
  cancelPendingDiffWork();
  cancelPendingReviewedStateWork();
  diffDataLoadVersion++;
  clearReviewedState({ updateTree: false });
  clearStaleFileTree("Loading files...", { clearSelection: false });
  clearStaleDiff("Loading selection...", { clearSelection: false });
  const applyVersion = ++deferredRangeApplyVersion;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (applyVersion === deferredRangeApplyVersion) {
        applyRangeInputs(options);
      }
    });
  });
}

function scheduleRangeInputs(options: RangeInputOptions = {}) {
  deferredRangeApplyVersion++;
  markInputsValid();
  cancelPendingDiffWork();
  cancelPendingReviewedStateWork();
  diffDataLoadVersion++;
  clearReviewedState();
  clearStaleFileTree("Loading files...", { clearSelection: false });
  clearStaleDiff("Waiting for typing to pause...", { clearSelection: false });
  setRangeStatus("Waiting for typing to pause...", "loading");
  clearTimeout(rangeInputTimer);
  rangeInputTimer = window.setTimeout(() => {
    rangeInputTimer = null;
    applyRangeInputs(options);
  }, 450);
}

rangeText.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.code !== "Enter" && event.keyCode !== 13) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  rangeText.blur();
  clearTimeout(rangeInputTimer);
  rangeInputTimer = null;
  applyRangeInputs();
});

rangeText.addEventListener("input", () => {
  updateRangeClearButton();
  scheduleRangeInputs();
});

rangeClearButton.addEventListener("click", () => {
  if (!rangeText.value) {
    return;
  }
  rangeText.value = "";
  updateRangeAnchorFromText();
  updateRangeClearButton();
  clearTimeout(rangeInputTimer);
  rangeInputTimer = null;
  rangeText.focus();
  applyRangeInputs();
});

for (const tab of targetTabs) {
  tab.addEventListener("click", () => setTargetMode(tab.dataset.targetMode));
}

function loadPrTarget() {
  const prNumber = prNumberText.value.trim();
  if (!prNumber) {
    setRangeStatus("Enter a PR number to load.", "error");
    return;
  }
  setTargetMode("pr");
  loadedBranch = prNumber;
  loadedBaseline = "";
  loadedTargetSuccessLabel = loadedTargetLabel();
  currentOverview = null;
  selectedFile = "";
  selectedTreePath = "";
  collapsedFolders.clear();
  folderDomCache.clear();
  clearReviewedState();
  updateReviewedToggle();
  rangeText.value = "";
  updateRangeClearButton();
  clearTimeout(rangeInputTimer);
  rangeInputTimer = null;
  setLoadedTargetStatus("Loading PR #" + prNumber.replace(/^#/, "") + "...", "loading");
  setRangeStatus("Loading PR...", "loading");
  loadDiffData({ resetInvalidRange: true, branchChanged: true, loadedTargetSuccessLabel, openOverviewOnLoad: true });
}

function loadBranchTarget() {
  setTargetMode("branch");
  loadedBranch = "";
  loadedBaseline = baselineText.value.trim();
  loadedTargetSuccessLabel = "Loaded local tree";
  currentOverview = null;
  selectedFile = "";
  selectedTreePath = "";
  collapsedFolders.clear();
  folderDomCache.clear();
  clearReviewedState();
  updateReviewedToggle();
  rangeText.value = "";
  updateRangeClearButton();
  clearTimeout(rangeInputTimer);
  rangeInputTimer = null;
  setLoadedTargetStatus("Loading local tree...", "loading");
  setRangeStatus("Loading local checkout...", "loading");
  loadDiffData({ resetInvalidRange: true, branchChanged: true, loadedTargetSuccessLabel, openOverviewOnLoad: true });
}

function loadActiveTarget() {
  if (targetMode === "pr") {
    loadPrTarget();
  } else {
    loadBranchTarget();
  }
}

function overviewUrl(overview) {
  return overview.htmlUrl + (overview.htmlUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
}

async function pollOverview(overview) {
  stopOverviewPolling();
  if (overview.htmlReady) {
    setOverviewSpinnerVisible(false);
    showOverviewFrame(overviewUrl(overview));
    return;
  }

  overviewPollTimer = window.setTimeout(async () => {
    overviewPollTimer = 0;
    try {
      const response = await fetch("/overview-request?id=" + encodeURIComponent(overview.id));
      if (!response.ok) {
        setOverviewSpinnerVisible(false);
        return;
      }
      const data = await response.json();
      if (data.overview?.htmlReady) {
        currentOverview = data.overview;
        setOverviewSpinnerVisible(false);
        showOverviewFrame(overviewUrl(data.overview));
        return;
      }
      if (data.overview) {
        currentOverview = data.overview;
      }
      await pollOverview(data.overview || overview);
    } catch (error) {
      setOverviewSpinnerVisible(false);
      console.error(error);
    }
  }, 2000);
}

async function requestOverview(options: RequestOverviewOptions = {}) {
  if (targetLoadInProgress && options.allowDuringTargetLoad !== true) {
    setOverviewSpinnerVisible(true);
    showOverviewPendingStatus("Waiting for the loaded target to finish before requesting overview...");
    return;
  }

  if (options.cancelWork !== false) {
    cancelPendingDiffWork();
    cancelPendingReviewedStateWork();
    diffDataLoadVersion++;
    fileDiffLoadVersion++;
  }
  if (currentOverview) {
    setOverviewSpinnerVisible(!currentOverview.htmlReady);
    if (!currentOverview.htmlReady) {
      showOverviewPendingStatus("Overview requested. Waiting for the generated overview document...");
    }
    await pollOverview(currentOverview);
    return;
  }

  setOverviewSpinnerVisible(true);
  showOverviewPendingStatus("Requesting overview...");
  try {
    const response = await fetch("/overview-request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        branch: loadedBranch,
        baseline: loadedBaseline,
        ignoreWhitespace: diffIgnoreWhitespace,
        targetLabel: loadedTargetStatuses[0]?.textContent || "",
      }),
    });
    if (!response.ok) {
      setOverviewSpinnerVisible(false);
      setRangeStatus(await response.text(), "error");
      return;
    }

    const data = await response.json();
    currentOverview = data.overview;
    setOverviewSpinnerVisible(!currentOverview.htmlReady);
    if (!currentOverview.htmlReady) {
      showOverviewPendingStatus("Overview requested. Waiting for the generated overview document...");
    }
    await pollOverview(currentOverview);
  } catch (error) {
    setOverviewSpinnerVisible(false);
    const errorMessage = error && error.message ? error.message : String(error);
    if (errorMessage === "Failed to fetch") {
      startReconnect("fetch-failed");
      return;
    }

    setRangeStatus("Failed to request overview.\n\nError: " + errorMessage, "error");
  }
}

async function checkoutPrTarget() {
  const prNumber = prNumberText.value.trim();
  if (!prNumber) {
    setRangeStatus("Enter a PR number to checkout.", "error");
    return;
  }

  checkoutPrButton.disabled = true;
  setTargetMode("pr");
  setLoadedTargetStatus("Checking out PR #" + prNumber.replace(/^#/, "") + "...", "loading");
  setRangeStatus("Checking out PR " + prNumber + "...", "loading");
  try {
    const response = await fetch("/checkout-pr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prNumber }),
    });
    if (!response.ok) {
      setLoadedTargetStatus("Checkout failed for #" + prNumber.replace(/^#/, ""), "error");
      showPlainDiff(await response.text());
      return;
    }

    const data = await response.json();
    const checkedOutBranch = data.branch || "";
    loadedBranch = "";
    loadedBaseline = data.baseline || "";
    loadedTargetSuccessLabel = "Loaded local tree with #" + String(data.prNumber || prNumber).replace(/^#/, "");
    currentOverview = null;
    selectedFile = "";
    selectedTreePath = "";
    collapsedFolders.clear();
    folderDomCache.clear();
    clearReviewedState();
    baselineText.value = loadedBaseline;
    rangeText.value = "";
    updateRangeClearButton();
    clearTimeout(rangeInputTimer);
    rangeInputTimer = null;
    markInputsValid();
    setTargetMode("branch");
    setLoadedTargetStatus("Loading local tree...", "loading");
    setRangeStatus("Checked out PR " + data.prNumber + " as " + checkedOutBranch + ".", "loading");
    await loadDiffData({ resetInvalidRange: true, branchChanged: true, loadedTargetSuccessLabel, openOverviewOnLoad: true });
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    if (errorMessage === "Failed to fetch") {
      setLoadedTargetStatus("Checkout failed for #" + prNumber.replace(/^#/, ""), "error");
      startReconnect("fetch-failed");
      return;
    }

    setLoadedTargetStatus("Checkout failed for #" + prNumber.replace(/^#/, ""), "error");
    showPlainDiff("Failed to checkout PR.\n\nError: " + errorMessage);
  } finally {
    checkoutPrButton.disabled = false;
  }
}

function isEditableElement(element) {
  return element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element?.isContentEditable;
}

function setPathReviewed(path, reviewed) {
  if (!path || !reviewedStateReady) {
    return false;
  }

  const folderPrefix = path.endsWith("/") ? path : path + "/";
  const matchingFiles = currentFiles
    .map((file) => file.path)
    .filter((filePath) => filePath === path || filePath.startsWith(folderPrefix));
  if (!matchingFiles.length) {
    return false;
  }

  if (reviewed) {
    for (const filePath of matchingFiles) {
      reviewedPaths.add(filePath);
    }
  } else {
    for (const filePath of matchingFiles) {
      reviewedPaths.delete(filePath);
    }
  }
  updateReviewedToggle();
  updateSelectedReviewedState(path);
  updateReviewedStateInTree(matchingFiles);
  persistReviewedFiles(matchingFiles, reviewed);
  return true;
}

function markPathReviewed(path) {
  return setPathReviewed(path, true);
}

function togglePathReviewed(path) {
  return setPathReviewed(path, !isPathReviewed(path));
}

function setSelectedFileReviewed(reviewed) {
  if (!selectedFile || !reviewedStateReady) {
    return false;
  }

  if (reviewed) {
    reviewedPaths.add(selectedFile);
  } else {
    reviewedPaths.delete(selectedFile);
  }
  updateReviewedToggle();
  updateReviewedStateInTree([selectedFile]);
  persistReviewedFiles([selectedFile], reviewed);
  return true;
}

async function persistReviewedFiles(files, reviewed) {
  if (!files.length) {
    return;
  }

  try {
    const response = await fetch("/reviewed-files", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reviewKeysByFile, files, reviewed }),
    });
    if (!response.ok) {
      showPlainDiff(await response.text());
    }
  } catch (error) {
    const errorMessage = error && error.message ? error.message : String(error);
    if (errorMessage === "Failed to fetch") {
      startReconnect("fetch-failed");
      return;
    }

    showPlainDiff("Failed to persist reviewed state.\n\nError: " + errorMessage);
  }
}

function updateReviewedToggle() {
  const reviewed = Boolean(selectedFile) && reviewedPaths.has(selectedFile);
  diffReviewedToggle.disabled = !selectedFile || !reviewedStateReady || !reviewKeysByFile[selectedFile];
  diffReviewedToggle.classList.toggle("reviewed", reviewed);
  diffReviewedToggle.setAttribute("aria-pressed", String(reviewed));
  diffReviewedToggle.title = selectedFile
    ? (reviewedStateReady ? (reviewed ? "Mark file as not reviewed" : "Mark file as reviewed") : "Review status is still loading")
    : "Select a file to mark it reviewed";
}

function updateSelectedReviewedState(path) {
  if (!selectedTreeElement || selectedTreePath !== path) {
    return;
  }

  if (selectedTreeElement.classList.contains("file-row")) {
    selectedTreeElement.classList.toggle("reviewed", reviewedPaths.has(path));
  } else {
    selectedTreeElement.parentElement.classList.toggle("reviewed", isPathReviewed(path));
  }
}

function updateReviewedStateInTree(changedFiles = null) {
  if (changedFiles) {
    for (const filePath of changedFiles) {
      const button = filePath === selectedFile ? selectedFileButton : null;
      if (button) {
        button.classList.toggle("reviewed", reviewedPaths.has(filePath));
      }
    }
  }

  if (reviewedTreeUpdateHandle) {
    cancelAnimationFrame(reviewedTreeUpdateHandle);
  }

  reviewedTreeUpdateHandle = requestAnimationFrame(() => {
    reviewedTreeUpdateHandle = 0;
    for (const button of fileTree.querySelectorAll<HTMLElement>(".file-row")) {
      button.classList.toggle("reviewed", reviewedPaths.has(button.dataset.path));
    }

    for (const summary of fileTree.querySelectorAll<HTMLElement>(".tree-folder > summary")) {
      summary.parentElement.classList.toggle("reviewed", isPathReviewed(summary.dataset.path));
    }
  });
}

function markFocusedTreeItemReviewed() {
  const active = document.activeElement;
  const path = active instanceof HTMLElement ? active.dataset.path : "";
  return togglePathReviewed(path) || togglePathReviewed(selectedTreePath) || markPathReviewed(selectedFile);
}

async function markSelectedFileReviewedAndNavigateNext() {
  if (selectedFile) {
    markPathReviewed(selectedFile);
  }
  await navigateDiff("next", { forceCrossFile: true });
}

loadPrButton.addEventListener("click", loadPrTarget);
checkoutPrButton.addEventListener("click", checkoutPrTarget);
loadBranchButton.addEventListener("click", loadBranchTarget);
overviewButton.addEventListener("click", () => {
  requestOverview();
});
diffReviewedToggle.addEventListener("click", () => {
  setSelectedFileReviewed(!reviewedPaths.has(selectedFile));
});

for (const input of [prNumberText, baselineText]) {
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.code !== "Enter" && event.keyCode !== 13) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    input.blur();
    loadActiveTarget();
  });

  input.addEventListener("input", () => {
    markInputsValid();
  });
}

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" && !isEditableElement(event.target)) {
    event.preventDefault();
    event.stopPropagation();
    if (pendingEndPrompt) {
      markSelectedFileReviewedAndNavigateNext();
    } else {
      markFocusedTreeItemReviewed();
    }
    return;
  }

  if (event.key !== "F7" && event.key !== "F8") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  navigateDiff(event.key === "F8" ? "next" : "previous", { forceCrossFile: pendingEndPrompt && event.key === "F8" });
}, true);

diffView.addEventListener("click", moveCaretToClickedDiffLine);
diffView.addEventListener("mouseup", (event) => {
  setTimeout(() => prepareCommentForSelectedDiffText(event), 0);
});
commentCancelButton.addEventListener("click", () => {
  currentCommentTarget = null;
  commentBody.value = "";
  renderCommentComposer();
  renderCommentsPane();
});
commentSaveButton.addEventListener("click", () => {
  saveCurrentComment().catch((error) => {
    setRangeStatus("Could not save local comment.", "error");
    console.error(error);
  });
});

function buildTree(files) {
  const root = { folders: new Map(), files: [], path: "" };
  for (const file of files) {
    const parts = file.path.split("/");
    let node = root;
    const folderParts = parts.slice(0, -1);
    for (let index = 0; index < folderParts.length; index++) {
      const part = folderParts[index];
      if (!node.folders.has(part)) {
        node.folders.set(part, { folders: new Map(), files: [], path: folderParts.slice(0, index + 1).join("/") });
      }
      node = node.folders.get(part);
    }
    node.files.push({ status: file.status, path: file.path, name: parts[parts.length - 1] });
  }
  return root;
}

function fileTreeSignature(files) {
  return files.map((file) => file.status + "\\0" + file.path).join("\\0");
}

function getCachedTreeModel(files) {
  const signature = fileTreeSignature(files);
  const cached = treeModelCache.get(signature);
  if (cached) {
    treeModelCache.delete(signature);
    treeModelCache.set(signature, cached);
    return { signature, root: cached };
  }

  const root = buildTree(files);
  treeModelCache.set(signature, root);
  while (treeModelCache.size > maxTreeModelCacheEntries) {
    treeModelCache.delete(treeModelCache.keys().next().value);
  }

  return { signature, root };
}

function isPathReviewed(path) {
  return Boolean(path) && currentFiles
    .filter((file) => file.path === path || file.path.startsWith(path + "/"))
    .every((file) => reviewedPaths.has(file.path));
}

function renderTreeNode(node) {
  const folders = Array.from(node.folders.entries())
    .sort((leftEntry, rightEntry) => leftEntry[0].localeCompare(rightEntry[0]))
    .map((entry) => {
      const name = entry[0];
      const child = entry[1];
      const details = document.createElement("details");
      details.className = "tree-folder";
      details.classList.toggle("reviewed", isPathReviewed(child.path));
      details.open = !collapsedFolders.has(child.path);
      const summary = document.createElement("summary");
      summary.textContent = name;
      summary.tabIndex = 0;
      summary.dataset.path = child.path;
      summary.classList.toggle("selected", child.path === selectedTreePath);
      if (child.path === selectedTreePath) {
        selectedTreeElement = summary;
      }
      const children = document.createElement("div");
      children.className = "tree-children";
      if (details.open) {
        attachFolderChildren(child, children);
      }
      summary.addEventListener("click", (event) => {
        event.preventDefault();
        if (isChevronClick(summary, event)) {
          toggleFolder(details, child, children);
          return;
        }

        updateSelectedTreeItem(summary, child.path);
        summary.focus();
      });
      summary.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.code !== "Enter" && event.keyCode !== 13) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        toggleFolder(details, child, children);
      });
      details.appendChild(summary);
      details.appendChild(children);
      return details;
    });

  const files = node.files
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((file) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "file-row" + (file.path === selectedTreePath ? " selected" : "") + (reviewedPaths.has(file.path) ? " reviewed" : "");
      if (file.path === selectedFile) {
        selectedFileButton = button;
      }
      if (file.path === selectedTreePath) {
        selectedTreeElement = button;
      }
      button.dataset.path = file.path;
      button.dataset.uiSection = "file-row";
      button.dataset.uiLabel = file.path;
      button.title = file.path;
      button.innerHTML = '<span class="file-path"></span><span class="file-status"></span>';
      const fileStatus = button.querySelector<HTMLElement>(".file-status");
      const filePath = button.querySelector<HTMLElement>(".file-path");
      filePath.textContent = file.name;
      filePath.title = file.path;
      fileStatus.textContent = file.status;
      const statusStyle = statusClass(file.status);
      if (statusStyle) {
        fileStatus.classList.add(statusStyle);
      }
      button.addEventListener("click", () => {
        if (selectedFile === file.path) {
          return;
        }
        selectedFile = file.path;
        updateSelectedTreeItem(button, file.path);
        updateSelectedFileInTree(button);
        updateReviewedToggle();
        loadSelectedFileDiff();
      });
      return button;
    });

  const fragment = document.createDocumentFragment();
  for (const folder of folders) {
    fragment.appendChild(folder);
  }
  for (const file of files) {
    fragment.appendChild(file);
  }
  return fragment;
}

function isChevronClick(summary, event) {
  const rect = summary.getBoundingClientRect();
  return event.clientX - rect.left <= 20;
}

function toggleFolder(details, node, children) {
  if (details.open) {
    collapsedFolders.add(node.path);
    details.open = false;
    folderDomCache.set(node.path, detachFolderChildren(children));
    if (selectedFile && selectedFile.startsWith(node.path + "/")) {
      selectedFileButton = null;
    }
    return;
  }

  collapsedFolders.delete(node.path);
  details.open = true;
  attachFolderChildren(node, children);
  updateSelectedFileInTree();
  updateReviewedStateInTree();
}

function attachFolderChildren(node, children) {
  if (children.childNodes.length) {
    return;
  }

  const cached = folderDomCache.get(node.path);
  if (cached) {
    folderDomCache.delete(node.path);
    children.appendChild(cached);
    return;
  }

  children.appendChild(renderTreeNode(node));
}

function detachFolderChildren(children) {
  const fragment = document.createDocumentFragment();
  while (children.firstChild) {
    fragment.appendChild(children.firstChild);
  }

  return fragment;
}

function statusClass(status) {
  if (status === "??") {
    return "untracked";
  }
  if (status.indexOf("A") !== -1) {
    return "added";
  }
  if (status.indexOf("M") !== -1) {
    return "modified";
  }
  if (status.indexOf("D") !== -1) {
    return "deleted";
  }
  if (status.indexOf("R") !== -1) {
    return "renamed";
  }
  if (status.indexOf("C") !== -1) {
    return "copied";
  }
  return "";
}

function updateSelectedFileInTree(button = null) {
  selectedFileButton = null;

  if (!selectedFile) {
    return;
  }

  const nextButton = button || Array.from(fileTree.querySelectorAll<HTMLElement>(".file-row"))
    .find((candidate) => candidate.dataset.path === selectedFile);
  if (nextButton) {
    selectedFileButton = nextButton;
    if (selectedTreePath === selectedFile) {
      updateSelectedTreeItem(nextButton, selectedFile);
    }
  }
}

function updateSelectedTreeItem(element, path) {
  if (selectedTreeElement) {
    selectedTreeElement.classList.remove("selected");
  }

  selectedTreePath = path || "";
  selectedTreeElement = element;
  if (selectedTreeElement) {
    selectedTreeElement.classList.add("selected");
  }
}

function resetSelectedFileButton() {
  selectedFileButton = null;
  selectedTreeElement = null;
}

function renderFileTree(files) {
  const { signature, root } = getCachedTreeModel(files);
  if (signature === currentTreeSignature && fileTree.dataset.treeSignature === signature) {
    updateSelectedFileInTree();
    updateReviewedToggle();
    updateReviewedStateInTree();
    return;
  }

  currentTreeSignature = signature;
  resetSelectedFileButton();
  folderDomCache.clear();
  fileTree.innerHTML = "";
  fileTree.dataset.treeSignature = signature;
  if (!files.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No changed files in this range.";
    fileTree.appendChild(empty);
    updateReviewedToggle();
    return;
  }

  fileTree.appendChild(renderTreeNode(root));
  updateReviewedToggle();
}

function renderFileTreeMessage(message) {
  currentTreeSignature = "";
  fileTree.dataset.treeSignature = "";
  fileTree.innerHTML = "";
  const item = document.createElement("p");
  item.className = "empty";
  item.textContent = message;
  fileTree.appendChild(item);
}

function setFilesSpinnerVisible(visible) {
  filesSpinner.classList.toggle("visible", visible);
}

function clearStaleFileTree(message = "Loading files...", options: ClearStaleViewOptions = {}) {
  currentFiles = [];
  selectedFileButton = null;
  selectedTreeElement = null;
  if (options.clearSelection !== false) {
    selectedTreePath = "";
  }
  currentTreeSignature = "";
  fileTree.dataset.treeSignature = "";
  fileTree.innerHTML = "";
  const item = document.createElement("p");
  item.className = "empty";
  item.textContent = message;
  fileTree.appendChild(item);
  setFilesSpinnerVisible(options.loading !== false);
}

function clearStaleDiff(message = "Loading diff...", options: ClearStaleViewOptions = {}) {
  currentDiff = "";
  if (options.clearSelection) {
    selectedFile = "";
    diffTitle.textContent = "Diff";
    diffTitle.title = "";
  }
  showPlainDiff(message);
}

function nextPaint() {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function cancelPendingDiffWork() {
  diffRenderVersion++;
  if (diffRenderTimer) {
    clearTimeout(diffRenderTimer);
    diffRenderTimer = 0;
  }
  if (diffRenderCancel) {
    diffRenderCancel();
    diffRenderCancel = null;
  }
  if (diffDataAbortController) {
    diffDataAbortController.abort();
    diffDataAbortController = null;
  }
  if (fileDiffAbortController) {
    fileDiffAbortController.abort();
    fileDiffAbortController = null;
  }
}

function cancelPendingReviewedStateWork() {
  reviewedStateLoadVersion++;
  if (reviewedStateAbortController) {
    reviewedStateAbortController.abort();
    reviewedStateAbortController = null;
  }
}

function waitForDiffRenderSlot(loadVersion, delayMs) {
  return new Promise((resolve) => {
    diffRenderCancel = () => resolve(false);
    diffRenderTimer = window.setTimeout(() => {
      diffRenderTimer = 0;
      diffRenderCancel = null;
      resolve(loadVersion === diffDataLoadVersion);
    }, delayMs);
  });
}

async function loadSelectedFileDiff(options: LoadSelectedFileDiffOptions = {}) {
  cancelPendingDiffWork();
  const rangeLoadVersion = diffDataLoadVersion;
  const fileLoadVersion = ++fileDiffLoadVersion;
  const abortController = new AbortController();
  fileDiffAbortController = abortController;
  currentDiff = "";
  currentCommentTarget = null;
  commentBody.value = "";
  renderCommentComposer();
  renderCommentsPane();
  clearDiffCommentMarkers();
  clearDiffSelectionHighlights();
  diffTitle.textContent = selectedFile ? fileNameFromPath(selectedFile) : "No file selected";
  diffTitle.title = selectedFile;
  if (!selectedFile) {
    showPlainDiff("No file selected.");
    return;
  }

  const path = "/file-diff";
  const params = new URLSearchParams({
    branch: loadedBranch,
    baseline: loadedBaseline,
    range: rangeText.value,
    file: selectedFile,
    ignoreWhitespace: diffIgnoreWhitespace ? "1" : "0",
  });
  const request = path + "?" + params;
  setRangeStatus("Loading diff for " + fileNameFromPath(selectedFile) + "...\n\nRequest: GET " + request, "loading");
  try {
    const response = await fetch(request, { signal: abortController.signal });
    if (rangeLoadVersion !== diffDataLoadVersion || fileLoadVersion !== fileDiffLoadVersion) {
      return;
    }
    if (fileDiffAbortController === abortController) {
      fileDiffAbortController = null;
    }
    if (!response.ok) {
      setRangeStatus("Could not load file diff.", "error");
      showPlainDiff(await response.text());
      return;
    }

    const data = await response.json();
    if (rangeLoadVersion !== diffDataLoadVersion || fileLoadVersion !== fileDiffLoadVersion) {
      return;
    }
    if (data.selectedFile && data.selectedFile !== selectedFile) {
      selectedFile = data.selectedFile;
      selectedTreePath = selectedFile;
      updateSelectedFileInTree();
      updateReviewedToggle();
    }
    currentDiff = data.diff || "";
    setRangeStatus("Rendering diff for " + fileNameFromPath(selectedFile) + "...", "loading");
    await nextPaint();
    if (rangeLoadVersion !== diffDataLoadVersion || fileLoadVersion !== fileDiffLoadVersion) {
      return;
    }
    if (!await waitForDiffRenderSlot(rangeLoadVersion, options.renderDelayMs ?? 250)) {
      return;
    }
    if (rangeLoadVersion !== diffDataLoadVersion || fileLoadVersion !== fileDiffLoadVersion) {
      return;
    }
    await renderDiff(currentDiff, selectedFile);
    renderCommentsPane();
    renderInlineComments();
    const diffNavigation = options.diffNavigation ?? "first";
    if (diffNavigation) {
      requestAnimationFrame(() => scrollToDiffInCurrentFile(diffNavigation));
    }
  } catch (error) {
    if (rangeLoadVersion !== diffDataLoadVersion || fileLoadVersion !== fileDiffLoadVersion) {
      return;
    }
    if (error && error.name === "AbortError") {
      return;
    }
    if (fileDiffAbortController === abortController) {
      fileDiffAbortController = null;
    }
    const errorMessage = error && error.message ? error.message : String(error);
    const isFetchFailure = errorMessage === "Failed to fetch";
    if (isFetchFailure) {
      startReconnect("fetch-failed");
      return;
    }
    setRangeStatus("Could not load file diff.", "error");
    showPlainDiff(errorMessage);
    console.error(error);
  }
}

async function loadReviewedStateForCurrentRange(rangeLoadVersion) {
  const loadVersion = ++reviewedStateLoadVersion;
  const abortController = new AbortController();
  reviewedStateAbortController = abortController;
  const params = new URLSearchParams({
    branch: loadedBranch,
    baseline: loadedBaseline,
    range: rangeText.value,
    ignoreWhitespace: diffIgnoreWhitespace ? "1" : "0",
  });
  try {
    const response = await fetch("/reviewed-state?" + params, { signal: abortController.signal });
    if (rangeLoadVersion !== diffDataLoadVersion || loadVersion !== reviewedStateLoadVersion) {
      return;
    }
    if (reviewedStateAbortController === abortController) {
      reviewedStateAbortController = null;
    }
    if (!response.ok) {
      console.error(await response.text());
      setFilesSpinnerVisible(false);
      return;
    }

    const data = await response.json();
    if (rangeLoadVersion !== diffDataLoadVersion || loadVersion !== reviewedStateLoadVersion) {
      return;
    }
    reviewCommitSha = data.reviewCommitSha || "";
    reviewKeysByFile = data.reviewKeysByFile || {};
    reviewedStateReady = true;
    reviewedPaths.clear();
    for (const filePath of data.reviewedFiles || []) {
      reviewedPaths.add(filePath);
    }
    updateReviewedToggle();
    updateReviewedStateInTree();
    setFilesSpinnerVisible(false);
  } catch (error) {
    if (rangeLoadVersion !== diffDataLoadVersion || loadVersion !== reviewedStateLoadVersion) {
      return;
    }
    if (error && error.name === "AbortError") {
      return;
    }
    if (reviewedStateAbortController === abortController) {
      reviewedStateAbortController = null;
    }
    setFilesSpinnerVisible(false);
    console.error(error);
  }
}

async function loadDiffData(options: LoadDiffDataOptions = {}) {
  deferredRangeApplyVersion++;
  cancelPendingDiffWork();
  cancelPendingReviewedStateWork();
  const loadVersion = ++diffDataLoadVersion;
  const requestedBranchForStatus = loadedBranch;
  const requestedBaseline = loadedBaseline;
  const targetSuccessLabel = options.loadedTargetSuccessLabel || loadedTargetLabelForBranch(requestedBranchForStatus);
  const requestedFile = options.preserveSelectedFile ? selectedFile : "";
  clearReviewedState({ updateTree: false });
  clearStaleFileTree("Loading files...", { clearSelection: !options.preserveSelectedFile });
  clearStaleDiff("Loading selection...", { clearSelection: !options.preserveSelectedFile });
  const abortController = new AbortController();
  diffDataAbortController = abortController;
  const path = "/diff-data";
  const params = new URLSearchParams({
    branch: loadedBranch,
    baseline: loadedBaseline,
    range: rangeText.value,
    file: requestedFile,
    ignoreWhitespace: diffIgnoreWhitespace ? "1" : "0",
  });
  const request = path + "?" + params;
  setRangeStatus("Loading selection...\n\nRequest: GET " + request, "loading");
  try {
    const response = await fetch(request, { signal: abortController.signal });
    if (loadVersion !== diffDataLoadVersion) {
      return;
    }
    if (diffDataAbortController === abortController) {
      diffDataAbortController = null;
    }
    if (!response.ok) {
      if (options.resetInvalidRange && rangeText.value.trim()) {
        rangeText.value = "";
        updateRangeClearButton();
        markInputsValid();
        loadDiffData({ ...options, resetInvalidRange: false, loadedTargetSuccessLabel: targetSuccessLabel });
        return;
      }
      setRangeStatus("Could not load selection.", "error");
      showPlainDiff(await response.text());
      if (targetLoadInProgress) {
        setLoadedTargetStatus(failedTargetLabel(targetSuccessLabel), "error");
      }
      setFilesSpinnerVisible(false);
      return;
    }
    const data = await response.json();
    if (loadVersion !== diffDataLoadVersion) {
      return;
    }
    if (data.baseline) {
      if (!requestedBaseline.trim()) {
        loadedBaseline = data.baseline;
        baselineText.value = data.baseline;
      }
    }
    if (data.range != null) {
      rangeText.value = data.range;
      updateRangeClearButton();
      updateRangeAnchorFromText();
    }
    setLoadedTargetStatus(targetSuccessLabel);
    selectedFile = data.selectedFile || "";
    selectedTreePath = selectedFile;
    currentFiles = data.files || [];
    renderCommitRows(data.entries || [], data.selectedIds || []);
    renderFileTree(currentFiles);
    diffTitle.textContent = selectedFile ? fileNameFromPath(selectedFile) : "No file selected";
    diffTitle.title = selectedFile;
    updateReviewedToggle();
    await nextPaint();
    if (loadVersion === diffDataLoadVersion) {
      loadReviewedStateForCurrentRange(loadVersion);
      if (options.openOverviewOnLoad) {
        requestOverview({ cancelWork: false, allowDuringTargetLoad: true });
      } else {
        showPlainDiff(selectedFile ? "Loading diff for " + fileNameFromPath(selectedFile) + "..." : "No file selected.");
        loadSelectedFileDiff(options);
      }
    }
  } catch (error) {
    if (loadVersion !== diffDataLoadVersion) {
      return;
    }
    if (error && error.name === "AbortError") {
      return;
    }
    if (diffDataAbortController === abortController) {
      diffDataAbortController = null;
    }
    if (options.resetInvalidRange && rangeText.value.trim()) {
      rangeText.value = "";
      updateRangeClearButton();
      markInputsValid();
      loadDiffData({ ...options, resetInvalidRange: false, loadedTargetSuccessLabel: targetSuccessLabel });
      return;
    }
    const errorMessage = error && error.message ? error.message : String(error);
    const isFetchFailure = errorMessage === "Failed to fetch";
    if (isFetchFailure) {
      startReconnect("fetch-failed");
      return;
    }
    showPlainDiff([
      "Failed to fetch diff data.",
      "",
      "Request: GET " + request,
      "",
      "Error: " + errorMessage,
    ].join("\n"));
    if (targetLoadInProgress) {
      setLoadedTargetStatus(failedTargetLabel(targetSuccessLabel), "error");
    }
    setFilesSpinnerVisible(false);
    return;
  }
}

connectLifecycleEvents();
initializeReviewFontScale();
updateRangeClearButton();
loadLocalComments().catch((error) => {
  console.error(error);
});
loadDiffData({ openOverviewOnLoad: true });
