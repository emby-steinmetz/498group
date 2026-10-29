// Read all phrase entries and display them in this new tab.
async function displayPhrases() {
  const saved = await chrome.storage.local.get(null);
  const phrases = Object.entries(saved)
    .filter(([key]) => key.startsWith("phrase:"))
    .map(([, value]) => value)
    .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  const list = document.getElementById("phrases");

  if (phrases.length === 0) {
    const item = document.createElement("li");
    item.textContent = "Nothing saved yet. Highlight text on a website first.";
    list.appendChild(item);
    return;
  }

  list.innerHTML = ""; // Clear loading text

  for (const phrase of phrases) {
    const item = document.createElement("li");
    item.style.marginBottom = "1.5em";
    item.style.borderBottom = "1px solid #ccc";
    item.style.paddingBottom = "10px";

    // 1. Show the Translated Word (or Original if not translated)
    const word = document.createElement("strong");
    word.style.fontSize = "18px";
    word.style.color = "#007bff";
    word.textContent = phrase.translatedWord || phrase.originalText;
    item.appendChild(word);

    // 2. Show the Original Word (if it was different)
    if (phrase.originalText && phrase.originalText !== phrase.translatedWord) {
      const original = document.createElement("div");
      original.style.fontSize = "12px";
      original.style.color = "#888";
      original.textContent = `Original: ${phrase.originalText}`;
      item.appendChild(original);
    }

    // 3. Show the Definition
    if (phrase.definition) {
      const def = document.createElement("div");
      def.style.marginTop = "5px";
      def.textContent = phrase.definition;
      item.appendChild(def);
    }

    // 4. Show the Page URL and Date
    const meta = document.createElement("div");
    meta.style.fontSize = "11px";
    meta.style.color = "#999";
    meta.style.marginTop = "8px";
    meta.textContent = `Saved: ${new Date(phrase.savedAt).toLocaleString()} | Page: ${phrase.url}`;
    item.appendChild(meta);

    list.appendChild(item);


  }
}

displayPhrases();
