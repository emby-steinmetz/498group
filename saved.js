// Merged vocabulary UI, JSON import/export,
// and Google-login compatibility.
//
// google-login.js calls displayPhrases() after
// synchronization and Save & Log Out.

const list = document.getElementById("phrases");
const searchInput = document.getElementById("search");
const sortInput = document.getElementById("sort");
const themeInput = document.getElementById("theme");
const sizeInput = document.getElementById("size");
const countElement = document.getElementById("count");
const resultCountElement = document.getElementById("result-count");

const importButton = document.getElementById("import-button");
const importFile = document.getElementById("import-file");
const importStatus = document.getElementById("import-status");

const exportButton = document.getElementById("export-button");
const exportStatus = document.getElementById("export-status");

let phrases = [];

// -----------------------------------------
// Appearance settings
// -----------------------------------------

function setAppearance() {
  document.documentElement.dataset.theme = themeInput.value;
  document.documentElement.dataset.size = sizeInput.value;
}

// -----------------------------------------
// Render vocabulary
// -----------------------------------------

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();

  const filtered = phrases.filter(phrase =>
    `${phrase.text ?? ""} ${phrase.originalText ?? ""} ${phrase.translatedWord ?? ""} ${phrase.url ?? ""}`
      .toLocaleLowerCase()
      .includes(query)
  );

  filtered.sort((a, b) => {
    // Sort by the translated word (or original text) instead of just text
    const wordA = a.translatedWord || a.originalText || a.text || "";
    const wordB = b.translatedWord || b.originalText || b.text || "";

    switch (sortInput.value) {
      case "oldest":
        return (a.savedAt ?? "").localeCompare(b.savedAt ?? "");

      case "az":
        return wordA.localeCompare(wordB, undefined, { sensitivity: "base" });

      case "za":
        return wordB.localeCompare(wordA, undefined, { sensitivity: "base" });

      default:
        return (b.savedAt ?? "").localeCompare(a.savedAt ?? "");
    }
  });

  countElement.textContent = `${phrases.length} saved`;

  resultCountElement.textContent =
    `${filtered.length} ` +
    `${filtered.length === 1 ? "entry" : "entries"} shown`;

  list.replaceChildren();

  if (!filtered.length) {
    const item = document.createElement("li");
    item.className = "empty";

    item.textContent = phrases.length
      ? "No matching words or phrases. Try a different search."
      : "Nothing saved yet. Highlight text on a website first.";

    list.appendChild(item);
    return;
  }

  for (const phrase of filtered) {
    const item = document.createElement("li");
    item.className = "phrase-card";

    // 1. Display the Translated Word (or Original Text if untranslated)
    const word = document.createElement("strong");
    word.className = "phrase-text";
    word.textContent = phrase.translatedWord || phrase.originalText || phrase.text;
    item.appendChild(word);

    // 2. Display the Original Word (if it was translated)
    if (phrase.originalText && phrase.originalText !== phrase.translatedWord) {
      const original = document.createElement("div");
      original.style.fontSize = "12px";
      original.style.color = "var(--text-muted, #888)";
      original.style.marginTop = "2px";
      original.textContent = `Original: ${phrase.originalText}`;
      item.appendChild(original);
    }

    // 3. Display the Definition
    if (phrase.definition) {
      const def = document.createElement("div");
      def.style.marginTop = "8px";
      def.style.fontSize = "14px";
      def.textContent = phrase.definition;
      item.appendChild(def);
    }

    // 4. Metadata (URL and Date)
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.style.marginTop = "10px";

    // Source URL
    const source = document.createElement("span");
    const urlString = phrase.url || "";
    
    try {
      const url = new URL(urlString);

      if (url.protocol === "https:" || url.protocol === "http:") {
        const link = document.createElement("a");
        link.href = url.href;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = `↗ ${url.hostname}`;
        source.appendChild(link);
      } else {
        source.textContent = urlString || "Source unavailable";
      }
    } catch {
      source.textContent = urlString || "Source unavailable";
    }

    // Saved date
    const time = document.createElement("span");
    const date = new Date(phrase.savedAt);

    time.textContent = Number.isNaN(date.getTime())
      ? "Date unavailable"
      : `Saved ${date.toLocaleString()}`;

    meta.append(source, time);
    item.appendChild(meta);
    list.appendChild(item);
  }
}

// -----------------------------------------
// Load phrases from Chrome local storage
// -----------------------------------------

async function displayPhrases() {
  try {
    const stored = await chrome.storage.local.get(null);

    phrases = Object.entries(stored)
      .filter(([key, value]) => {
        if (!key.startsWith("phrase:")) return false;
        // Accept either the old format (value.text) or the new format (value.originalText)
        return (typeof value?.text === "string" && value.text.trim()) || 
               (typeof value?.originalText === "string" && value.originalText.trim());
      })
      .map(([, value]) => value);

    render();

  } catch (error) {
    console.error("Could not load vocabulary:", error);
    list.textContent =
      "Could not load saved phrases. Please reload the page.";
  }
}

// -----------------------------------------
// Initialize appearance and vocabulary
// -----------------------------------------

async function initialize() {
  try {
    const settings = await chrome.storage.local.get([
      "ui:theme",
      "ui:size",
      "ui:sort"
    ]);

    themeInput.value =
      ["light", "dark", "system"].includes(settings["ui:theme"])
        ? settings["ui:theme"]
        : "light";

    sizeInput.value =
      ["normal", "large"].includes(settings["ui:size"])
        ? settings["ui:size"]
        : "normal";

    sortInput.value =
      ["newest", "oldest", "az", "za"].includes(settings["ui:sort"])
        ? settings["ui:sort"]
        : "newest";

    setAppearance();

  } catch (error) {
    console.error("Could not load display settings:", error);
  }

  await displayPhrases();
}

// -----------------------------------------
// Search, sorting, and appearance events
// -----------------------------------------

searchInput.addEventListener("input", render);

sortInput.addEventListener("change", () => {
  void chrome.storage.local.set({ "ui:sort": sortInput.value });
  render();
});

themeInput.addEventListener("change", () => {
  void chrome.storage.local.set({ "ui:theme": themeInput.value });
  setAppearance();
});

sizeInput.addEventListener("change", () => {
  void chrome.storage.local.set({ "ui:size": sizeInput.value });
  setAppearance();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some(key => key.startsWith("phrase:"))) {
    void displayPhrases();
  }
});

// -----------------------------------------
// JSON Import
// -----------------------------------------

importButton.addEventListener("click", () => {
  importFile.click();
});

importFile.addEventListener("change", async () => {
  const file = importFile.files?.[0];
  if (!file) return;

  importButton.disabled = true;
  importStatus.textContent = "Importing...";

  try {
    const data = JSON.parse(await file.text());

    if (!Array.isArray(data)) {
      throw new Error("Expected a JSON array.");
    }

    // Accept either strings, old phrase objects (text), or new ones (originalText)
    const incoming = data.map((entry, index) => {
      const rawText = typeof entry === "string" ? entry : (entry?.originalText || entry?.text);

      if (typeof rawText !== "string" || !rawText.trim()) {
        throw new Error(`Invalid word at position ${index + 1}.`);
      }

      return {
        originalText: rawText.trim(),
        translatedWord: entry?.translatedWord || "",
        definition: entry?.definition || "",
        url: typeof entry?.url === "string" ? entry.url : "Imported from file",
        savedAt: typeof entry?.savedAt === "string" && !Number.isNaN(Date.parse(entry.savedAt))
          ? entry.savedAt
          : new Date().toISOString()
      };
    });

    const stored = await chrome.storage.local.get(null);
    
    // Check for duplicates using the translated word or original text
    const existing = new Set(
      Object.entries(stored)
        .filter(([key, value]) => key.startsWith("phrase:"))
        .map(([, value]) => (value.originalText || value.text || "").trim().toLowerCase())
    );

    const additions = {};

    for (const phrase of incoming) {
      const normalized = (phrase.originalText || "").toLowerCase();
      if (existing.has(normalized)) continue;

      const key = `phrase:${Date.now()}:${crypto.randomUUID()}`;
      additions[key] = phrase;
      existing.add(normalized);
    }

    if (Object.keys(additions).length) {
      await chrome.storage.local.set(additions);
    }

    await displayPhrases();

    const count = Object.keys(additions).length;
    importStatus.textContent =
      `Success! Imported ${count} new phrases. ` +
      `Skipped ${incoming.length - count} duplicates.`;

  } catch (error) {
    console.error("Wordbank import failed:", error);
    importStatus.textContent = `Import failed: ${error.message}`;
  } finally {
    importButton.disabled = false;
    importFile.value = "";
  }
});

// -----------------------------------------
// JSON Export
// -----------------------------------------

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;

  try {
    const stored = await chrome.storage.local.get(null);

    // Export the full objects now so definitions aren't lost!
    const words = Object.entries(stored)
      .filter(([key]) => key.startsWith("phrase:"))
      .map(([, value]) => value);

    const blob = new Blob([JSON.stringify(words, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `wordbank-${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);

    exportStatus.textContent = `Exported ${words.length} words successfully!`;

  } catch (error) {
    console.error("Wordbank export failed:", error);
    exportStatus.textContent = `Export failed: ${error.message}`;
  } finally {
    exportButton.disabled = false;
  }
});

// -----------------------------------------
// Clear All
// -----------------------------------------

const clearButton = document.getElementById("clear-button");
const clearStatus = document.getElementById("clear-status");

clearButton.addEventListener("click", async () => {
  const confirmed = window.confirm(
    "Are you sure you want to delete ALL saved words?\n\n" +
    "This cannot be undone unless you have a backup."
  );

  if (!confirmed) return;

  clearButton.disabled = true;

  try {
    const stored = await chrome.storage.local.get(null);
    const keys = Object.keys(stored).filter(key => key.startsWith("phrase:"));

    await chrome.storage.local.remove(keys);
    await displayPhrases();

    clearStatus.textContent = `Successfully deleted ${keys.length} saved phrases.`;

  } catch (error) {
    console.error("Could not clear Wordbank:", error);
    clearStatus.textContent = `Failed to clear Wordbank: ${error.message}`;
  } finally {
    clearButton.disabled = false;
  }
});

// Start the interface.
void initialize();