/** Delegated handler for `[data-copy]` buttons inside rendered code blocks. */
export function installCopyHandler() {
  document.addEventListener("click", async (e) => {
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-copy]");
    if (!button) return;
    const text =
      button.dataset.copyText ?? button.closest(".code-block")?.querySelector("pre")?.textContent ?? "";
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      return;
    }
    const label = button.querySelector("span");
    const previous = label?.textContent;
    button.setAttribute("data-copied", "");
    if (label) label.textContent = "Copied";
    setTimeout(() => {
      button.removeAttribute("data-copied");
      if (label && previous) label.textContent = previous;
    }, 1400);
  });
}
