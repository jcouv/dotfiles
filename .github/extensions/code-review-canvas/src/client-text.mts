export function isPrNumber(value: string) {
  return /^#?\d+$/.test(value.trim());
}

export function loadedTargetLabelForBranch(branch: string) {
  return isPrNumber(branch) ? "PR #" + branch.trim().replace(/^#/, "") + " loaded" : "Loaded local tree";
}

export function failedTargetLabel(successLabel: string) {
  if (successLabel.startsWith("PR #") && successLabel.endsWith(" loaded")) {
    return "Failed to load " + successLabel.slice(0, -" loaded".length);
  }

  return "Failed to load target";
}

export function fileNameFromPath(filePath: string) {
  return filePath.split("/").pop() || filePath;
}

export function makeWhitespaceVisible(text: string) {
  return text.replaceAll(" ", "·").replaceAll("\t", "⇥");
}

