// This script runs inside ordinary web pages.
let translationBox = null;
let previousSelection = "";

function closeBox() {
  translationBox?.remove();
  translationBox = null;
}

async function saveSelection() {
  const selection = window.getSelection();
  const text = selection?.toString().trim() ?? "";

  if (!text) {
    closeBox();
    previousSelection = "";
    return;
  }

  // Don't save the same selection again when multiple events fire.
  if (text === previousSelection) return;
  previousSelection = text;

  const rectangle = selection.getRangeAt(0).getBoundingClientRect();
  closeBox();

  // Empty space where a translation will eventually appear.
  translationBox = document.createElement("div");
  translationBox.setAttribute("role", "dialog");
  translationBox.setAttribute("aria-label", "Translation placeholder");
  Object.assign(translationBox.style, {
    position: "fixed",
    left: `${Math.min(Math.max(8, rectangle.left), Math.max(8, innerWidth - 248))}px`,
    top: `${Math.min(rectangle.bottom + 8, Math.max(8, innerHeight - 118))}px`,
    width: "240px",
    height: "110px",
    background: "white",
    border: "1px solid black",
    boxSizing: "border-box",
    zIndex: "2147483647"
  });

  const closeButton = document.createElement("button");
  closeButton.textContent = "×";
  closeButton.title = "Close";
  closeButton.setAttribute("aria-label", "Close translation box");
  Object.assign(closeButton.style, {
    position: "absolute",
    right: "4px",
    top: "4px",
    cursor: "pointer"
  });
  closeButton.addEventListener("click", () => {
    closeBox();
    window.getSelection()?.removeAllRanges();
    previousSelection = "";
  });

  translationBox.appendChild(closeButton);
  document.documentElement.appendChild(translationBox);

  // Each saved phrase is a separate entry in Chrome's local storage.
  const key = `phrase:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  try {
    await chrome.storage.local.set({
      [key]: {
        text,
        url: location.href,
        savedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error("Could not save selected text:", error);
  }
}

// Mouse highlighting.
document.addEventListener("mouseup", (event) => {
  if (translationBox?.contains(event.target)) return;
  saveSelection();
});

// Allow highlighting with Shift + arrow keys, too.
document.addEventListener("keyup", (event) => {
  if (["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
    saveSelection();
  }
});

document.addEventListener("mousedown", (event) => {
  if (!translationBox?.contains(event.target)) {
    closeBox();
    previousSelection = "";
  }
});
