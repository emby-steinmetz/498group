// Vocabulary library UI. Uses the existing phrase:* storage entries without changing them.
const list = document.getElementById("phrases");
const searchInput = document.getElementById("search");
const sortInput = document.getElementById("sort");
const themeInput = document.getElementById("theme");
const sizeInput = document.getElementById("size");
let phrases = [];

function setAppearance() {
  document.documentElement.dataset.theme = themeInput.value;
  document.documentElement.dataset.size = sizeInput.value;
}

function render() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filtered = phrases.filter(p => `${p.text ?? ""} ${p.url ?? ""}`.toLocaleLowerCase().includes(query));
  filtered.sort((a, b) => {
    switch (sortInput.value) {
      case "oldest": return (a.savedAt ?? "").localeCompare(b.savedAt ?? "");
      case "az": return (a.text ?? "").localeCompare(b.text ?? "", undefined, { sensitivity:"base" });
      case "za": return (b.text ?? "").localeCompare(a.text ?? "", undefined, { sensitivity:"base" });
      default: return (b.savedAt ?? "").localeCompare(a.savedAt ?? "");
    }
  });
  document.getElementById("count").textContent = `${phrases.length} saved`;
  document.getElementById("result-count").textContent = `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"} shown`;
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = phrases.length ? "No matching words or phrases. Try a different search." : "Nothing saved yet. Highlight text on a website first.";
    list.appendChild(empty);
    return;
  }
  for (const phrase of filtered) {
    const item = document.createElement("li"); item.className = "phrase-card";
    const word = document.createElement("strong"); word.className = "phrase-text";
    word.textContent = phrase.text ?? ""; item.appendChild(word);
    const meta = document.createElement("div"); meta.className = "meta";
    const source = document.createElement("span");
    const link = document.createElement("a");
    try {
      const url = new URL(phrase.url);
      if (url.protocol === "https:" || url.protocol === "http:") {
        link.href = url.href; link.target = "_blank"; link.rel = "noopener noreferrer";
        link.textContent = `↗ ${url.hostname}`; source.appendChild(link);
      } else { source.textContent = "Source unavailable"; }
    } catch { source.textContent = "Source unavailable"; }
    const time = document.createElement("span");
    const date = new Date(phrase.savedAt);
    time.textContent = Number.isNaN(date.getTime()) ? "Date unavailable" : `Saved ${date.toLocaleString()}`;
    meta.append(source, time); item.appendChild(meta); list.appendChild(item);
  }
}

async function initialize() {
  try {
    const settings = await chrome.storage.local.get(["ui:theme", "ui:size", "ui:sort"]);
    themeInput.value = ["light", "dark", "system"].includes(settings["ui:theme"]) ? settings["ui:theme"] : "light";
    sizeInput.value = ["normal", "large"].includes(settings["ui:size"]) ? settings["ui:size"] : "normal";
    sortInput.value = ["newest", "oldest", "az", "za"].includes(settings["ui:sort"]) ? settings["ui:sort"] : "newest";
    setAppearance();
    const saved = await chrome.storage.local.get(null);
    phrases = Object.entries(saved).filter(([key]) => key.startsWith("phrase:")).map(([, value]) => value).filter(value => value && typeof value === "object");
    render();
  } catch (error) {
    console.error("Could not load vocabulary:", error);
    list.textContent = "Could not load saved phrases. Please reload the page.";
  }
}
searchInput.addEventListener("input", render);
sortInput.addEventListener("change", () => { chrome.storage.local.set({ "ui:sort":sortInput.value }); render(); });
themeInput.addEventListener("change", () => { chrome.storage.local.set({ "ui:theme":themeInput.value }); setAppearance(); });
sizeInput.addEventListener("change", () => { chrome.storage.local.set({ "ui:size":sizeInput.value }); setAppearance(); });
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && Object.keys(changes).some(key => key.startsWith("phrase:"))) initialize();
});
initialize();
// Start the interface.
void initialize();
