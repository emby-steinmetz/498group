// Read all phrase entries and display them in this new tab.
async function displayPhrases() {
  const saved = await chrome.storage.local.get(null);
  const phrases = Object.entries(saved)
    .filter(([key]) => key.startsWith("phrase:"))
    .map(([, value]) => value)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const list = document.getElementById("phrases");
  list.replaceChildren();

  if (phrases.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Nothing saved yet. Highlight text on a website first.";
    list.appendChild(item);
    return;
  }

  for (const phrase of phrases) {
    const item = document.createElement("li");
    const word = document.createElement("strong");
    word.textContent = phrase.text;
    item.appendChild(word);

    const source = document.createElement("div");
    source.textContent = `Page: ${phrase.url}`;
    item.appendChild(source);

    const time = document.createElement("div");
    time.textContent = `Saved: ${new Date(phrase.savedAt).toLocaleString()}`;
    item.appendChild(time);

    item.style.marginBottom = "1em";
    list.appendChild(item);
  }
}

displayPhrases();


const importButton = document.getElementById("import-button");
const importFile = document.getElementById("import-file");
const importStatus = document.getElementById("import-status");

// Open the filesystem browser.
importButton.addEventListener("click", () => {
  importFile.click();
});

// Process the chosen file.
importFile.addEventListener("change", async () => {
  const file = importFile.files[0];
  if (!file) return;

  importButton.disabled = true;
  importStatus.textContent = "Importing...";

  try {
    const data = JSON.parse(await file.text());

    if (!Array.isArray(data)) {
      throw new Error("Expected a JSON array.");
    }

    // Accept either strings or saved phrase objects.
    const phrases = data.map((entry, index) => {
      const rawText =
        typeof entry === "string" ? entry : entry?.text;

      if (typeof rawText !== "string" || !rawText.trim()) {
        throw new Error(`Invalid word at position ${index + 1}.`);
      }

      return {
        text: rawText.trim(),
        url: typeof entry?.url === "string"
          ? entry.url
          : "Imported from file",
        savedAt: typeof entry?.savedAt === "string" &&
                 !Number.isNaN(Date.parse(entry.savedAt))
          ? entry.savedAt
          : new Date().toISOString()
      };
    });

    // Find words that are already saved.
    const stored = await chrome.storage.local.get(null);
    const existing = new Set(
      Object.entries(stored)
        .filter(([key, value]) =>
          key.startsWith("phrase:") &&
          typeof value?.text === "string"
        )
        .map(([, value]) => value.text.trim().toLowerCase())
    );

    const newPhrases = {};

    for (const phrase of phrases) {
      const normalized = phrase.text.toLowerCase();

      if (existing.has(normalized)) continue;

      const key = `phrase:${Date.now()}:${crypto.randomUUID()}`;
      newPhrases[key] = phrase;
      existing.add(normalized);
    }

    // Save the imported phrases locally.
    await chrome.storage.local.set(newPhrases);

    // Refresh the displayed wordbank.
    await displayPhrases();

    const count = Object.keys(newPhrases).length;
    importStatus.textContent =
      `Success! Imported ${count} new phrases. ` +
      `Skipped ${phrases.length - count} duplicates.`;

  } catch (error) {
    console.error("Wordbank import failed:", error);
    importStatus.textContent = `Import failed: ${error.message}`;
  } finally {
    importButton.disabled = false;
    importFile.value = "";
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;

  const phrasesChanged = Object.keys(changes).some(
    key => key.startsWith("phrase:")
  );

  if (phrasesChanged) {
    void displayPhrases();
  }
});


const exportButton = document.getElementById("export-button");
const exportStatus = document.getElementById("export-status");

exportButton.addEventListener("click", async () => {
  exportButton.disabled = true;

  try {
    // Read everything from Chrome's local storage.
    const stored = await chrome.storage.local.get(null);

    // Extract only saved words, not login or UI settings.
    const words = Object.entries(stored)
      .filter(([key, value]) =>
        key.startsWith("phrase:") &&
        typeof value?.text === "string" &&
        value.text.trim()
      )
      .map(([, value]) => value.text);

    // Convert the words into JSON.
    const json = JSON.stringify(words, null, 2);

    // Create a downloadable file.
    const blob = new Blob([json], {
      type: "application/json"
    });

    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = `wordbank-${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    // Release the temporary download URL.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    exportStatus.textContent =
      `Exported ${words.length} words successfully!`;

  } catch (error) {
    console.error("Wordbank export failed:", error);
    exportStatus.textContent =
      `Export failed: ${error.message}`;
  } finally {
    exportButton.disabled = false;
  }
});

