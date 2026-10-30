// This script runs inside ordinary web pages.
let translationBox = null;
let previousSelection = "";

// -----------------------------------------
// YOUR TRANSLATION & DICTIONARY LOGIC
// -----------------------------------------

function detect_language_type(word){
  const language_list =  [
    { lang: "zh-CN", regex: /[\u4e00-\u9fff]/ },       // CJK Unified Ideographs (Chinese)
    { lang: "ja",    regex: /[\u3040-\u309f\u30a0-\u30ff]/ }, // Hiragana + Katakana
    { lang: "ko",    regex: /[\uac00-\ud7af\u1100-\u11ff]/ }, // Hangul
    { lang: "ru",    regex: /[\u0400-\u04ff]/ },       // Cyrillic
    { lang: "ar",    regex: /[\u0600-\u06ff]/ },       // Arabic
    { lang: "he",    regex: /[\u0590-\u05ff]/ },       // Hebrew
    { lang: "th",    regex: /[\u0e00-\u0e7f]/ },       // Thai
    { lang: "hi",    regex: /[\u0900-\u097f]/ },       // Devanagari (Hindi)
    { lang: "el",    regex: /[\u0370-\u03ff]/ },       // Greek
  ];
  
  for(const {lang, regex} of language_list ){
    if(regex.test(word)) return lang;
  }

  return "en";
}


async function language_detector(word) {
  const API_KEY = '2c891f5edac1adbb9d0495bc7888cdab'; 
  const url = 'https://ws.detectlanguage.com/v3/detect';

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `q=${encodeURIComponent(word)}`
    });

    if (!res.ok) {
      console.error(`API Error: ${res.status}`);
      return detect_language_type(word); // Fallback to regex if API fails
    }

    const data = await res.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const topMatch = data[0];
      console.log(`Detected: ${topMatch.language} (Confidence: ${topMatch.score})`);
      return topMatch.language;
    }
    
    return detect_language_type(word);
  } catch (error) {
    console.error("Detection failed:", error);
    return detect_language_type(word);
  }
}


async function translate(word){
  let type = await language_detector(word);
  
  if(type === "en") return word;

  if (type === "zh") type = "zh-CN"; 

  const lan_pair = `${type}|en`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${encodeURIComponent(lan_pair)}`;

  const res = await fetch(url);
  const data = await res.json();

  if(data.responseStatus === 200){
    return data.responseData.translatedText;
  }
  return word;
}


async function getDefinition(word) {
  try {
    const defRes = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
    const defData = await defRes.json();
    
    let definition = "";
    let partOfSpeech = "";
    
    if (defData.length > 0 && defData[0].defs) {
      const rawDef = defData[0].defs[0];
      const parts = rawDef.split("\t");
      partOfSpeech = parts[0]; 
      definition = parts[1] || "";
    } else {
      return null; 
    }

    const synRes = await fetch(`https://api.datamuse.com/words?rel_syn=${word}&max=4`);
    const synData = await synRes.json();
    const synonyms = synData.map(item => item.word);

    const antRes = await fetch(`https://api.datamuse.com/words?rel_ant=${word}&max=4`);
    const antData = await antRes.json();
    const antonyms = antData.map(item => item.word);

    return { partOfSpeech, definition, synonyms, antonyms };
  } catch (e) { 
    return null; 
  }
}


// -----------------------------------------
// MERGED UI AND SAVING LOGIC
// -----------------------------------------

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

  if (text === previousSelection) return;
  previousSelection = text;

  // --- YOUR TEAMMATE'S BACKEND SYNC ---
  // If you want to send this word to her database immediately, call this:
  // saveToWordbank(text); 

  const rectangle = selection.getRangeAt(0).getBoundingClientRect();
  closeBox();

  translationBox = document.createElement("div");
  translationBox.setAttribute("role", "dialog");
  translationBox.setAttribute("aria-label", "Translation placeholder");
  Object.assign(translationBox.style, {
    position: "fixed",
    left: `${Math.min(Math.max(8, rectangle.left), Math.max(8, innerWidth - 248))}px`,
    top: `${Math.min(rectangle.bottom + 8, Math.max(8, innerHeight - 118))}px`,
    width: "240px",
    background: "white",
    border: "1px solid #ccc",
    borderRadius: "6px",
    boxSizing: "border-box",
    zIndex: "2147483647",
    padding: "10px",
    fontSize: "14px"
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

  const textDisplay = document.createElement("div");
  textDisplay.style.marginTop = "15px";
  textDisplay.innerHTML = "<em>Loading...</em>";
  translationBox.appendChild(textDisplay);

  const saveButton = document.createElement("button");
  saveButton.textContent = "save to Library";
  Object.assign(saveButton.style, {
    marginTop: "15px",
    padding: "5px 10px",
    cursor: "pointer",
    backgroundColor: "#007bff",
    color: "white",
    border: "none",
    borderRadius: "4px"
  });
  translationBox.appendChild(saveButton);
  document.documentElement.appendChild(translationBox);

  let translatedWord = text; 
  let definitionHtml = "";

  try {
    translatedWord = (await translate(text)) || text;
    
    if (text.split(" ").length === 1) {
      const cleanEnglishWord = translatedWord.replace(/[^a-zA-Z]/g, "").toLowerCase().trim();
      
      if (cleanEnglishWord.length > 0) {
        const info = await getDefinition(cleanEnglishWord);
        
        if (info) {
          let synHtml = "";
          if (info.synonyms.length > 0) {
            synHtml = `<div style="font-size: 12px; margin-top: 6px; color: #28a745;"><strong>Synonyms:</strong> ${info.synonyms.join(", ")}</div>`;
          }
          let antHtml = "";
          if (info.antonyms.length > 0) {
            antHtml = `<div style="font-size: 12px; margin-top: 4px; color: #dc3545;"><strong>Antonyms:</strong> ${info.antonyms.join(", ")}</div>`;
          }
          definitionHtml = `
            <hr style="border: 0; border-top: 1px solid #eee; margin: 8px 0;">
            <span style="color: #007bff; font-size: 12px; font-style: italic;">${info.partOfSpeech}</span>
            <div style="color:#333; font-size:13px; margin-top: 2px;">${info.definition}</div>
            ${synHtml}
            ${antHtml}
          `;
        } else {
           definitionHtml = `<div style="color: red; font-size: 11px;">Could not find definition for "${cleanEnglishWord}"</div>`;
        }
      }
    }

    let originalHtml = "";
    if (text !== translatedWord) {
      originalHtml = `<div style="font-size: 11px; color: #999; margin-top: 10px; text-align: right;">Original: ${text}</div>`;
    }

    textDisplay.innerHTML = `
      <div style="margin-bottom: 5px;">
        <strong style="font-size: 16px;">${translatedWord}</strong>
      </div>
      ${definitionHtml}
      ${originalHtml}
    `;

  } catch (error) {
    console.error("Error updating box:", error);
    textDisplay.textContent = "Error loading details."; 
  }

  saveButton.addEventListener("click", async() =>{
    if (!chrome.runtime?.id) {
      saveButton.textContent = "Refresh page!";
      saveButton.style.backgroundColor = "#dc3545"; 
      return;
    }
    saveButton.textContent = "saved!";
    saveButton.disabled = true;
    saveButton.style.backgroundColor = "#28a745"; 
    
    const key = `phrase:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const plaindefinition = definitionHtml ? definitionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : "No definition found.";
    
    await chrome.storage.local.set({
      [key]: {
        originalText : text,
        translatedWord : translatedWord,
        definition : plaindefinition,
        url: location.href,
        savedAt: new Date().toISOString()
      }
    });

    // --- YOUR TEAMMATE'S BACKEND SYNC ON BUTTON CLICK ---
    // If she wants the word sent to the database when the user clicks "Save":
    saveToWordbank(translatedWord);
  });
}


// -----------------------------------------
// TEAMMATE'S BACKEND SYNC FUNCTION
// -----------------------------------------
async function saveToWordbank(selectedText) {
  console.log("Wordbank function called:", selectedText);
  const text = selectedText.trim();
  if (!text) return;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'WORDBANK_SAVE_TOKEN',
      text: text,
      source_language: 'en',
      source_url: window.location.href
    });

    if (response?.success) {
      console.log('Saved to Wordbank backend!', response.data);
    } else {
      console.error('Wordbank backend error:', response?.error);
    }
  } catch (error) {
    console.error('Could not contact Wordbank:', error);
  }
}


// -----------------------------------------
// EVENT LISTENERS
// -----------------------------------------

document.addEventListener("mouseup", (event) => {
  if (translationBox?.contains(event.target)) return;
  saveSelection();
});

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