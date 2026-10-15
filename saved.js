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
