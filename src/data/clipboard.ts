export async function copyTextToClipboardWithFallback(
  textToCopy: string,
): Promise<boolean> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(textToCopy);
      return true;
    } catch {
      /* fall through to the legacy execCommand path below */
    }
  }
  try {
    const temporaryTextarea = document.createElement("textarea");
    temporaryTextarea.value = textToCopy;
    temporaryTextarea.setAttribute("readonly", "");
    temporaryTextarea.style.position = "fixed";
    temporaryTextarea.style.opacity = "0";
    document.body.appendChild(temporaryTextarea);
    temporaryTextarea.select();
    const copyCommandSucceeded = document.execCommand("copy");
    document.body.removeChild(temporaryTextarea);
    return copyCommandSucceeded;
  } catch {
    return false;
  }
}
