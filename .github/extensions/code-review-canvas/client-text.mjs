export function isPrNumber(value) {
    return /^#?\d+$/.test(value.trim());
}
export function loadedTargetLabelForBranch(branch) {
    return isPrNumber(branch) ? "PR #" + branch.trim().replace(/^#/, "") + " loaded" : "Loaded local tree";
}
export function failedTargetLabel(successLabel) {
    if (successLabel.startsWith("PR #") && successLabel.endsWith(" loaded")) {
        return "Failed to load " + successLabel.slice(0, -" loaded".length);
    }
    return "Failed to load target";
}
export function fileNameFromPath(filePath) {
    return filePath.split("/").pop() || filePath;
}
export function makeWhitespaceVisible(text) {
    return text.replaceAll(" ", "·").replaceAll("\t", "⇥");
}
