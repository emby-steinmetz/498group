// This script runs inside ordinary web pages.
let translationBox = null;
let previousSelection = "";

//determine the language type
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

    // Check for errors (401 = bad key, 402 = quota exceeded)
    if (!res.ok) {
      console.error(`API Error: ${res.status}`);
      return "en"; // Fallback
    }

    const data = await res.json();
    
    // Example: [{"language":"zh","score":0.99}]
    if (Array.isArray(data) && data.length > 0) {
      const topMatch = data[0];
      console.log(`Detected: ${topMatch.language} (Confidence: ${topMatch.score})`);
      return topMatch.language;
    }
    
    return "en";
  } catch (error) {
    console.error("Detection failed:", error);
    return "en";
  }
}



//translate the given word to english
async function translate(word){
  //detect langulate type
  let type = await language_detector(word);
  
  if(type === "en") return word;

  if (type === "zh") type = "zh-CN"; 


  // put in right format
  const lan_pair = `${type}|en`;
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=${encodeURIComponent(lan_pair)}`;

  //fatch the url content
  const res = await fetch(url);
  //get it in json form
  const data = await res.json();

  if(data.responseStatus === 200){
    const translated = data.responseData.translatedText;
    return translated
  }
  return word;
}

// get the difinition of the translated word
async function getDefinition(word) {
  try {
    // 1. Fetch definition from Datamuse
    const defRes = await fetch(`https://api.datamuse.com/words?sp=${word}&md=d&max=1`);
    const defData = await defRes.json();
    
    let definition = "";
    let partOfSpeech = "";
    
    if (defData.length > 0 && defData[0].defs) {
      // Datamuse returns definitions like "n\tThe present day" (part of speech \t definition)
      const rawDef = defData[0].defs[0];
      const parts = rawDef.split("\t");
      partOfSpeech = parts[0]; 
      definition = parts[1] || "";
    } else {
      return null; // Word not found
    }

    // 2. Fetch synonyms from Datamuse
    const synRes = await fetch(`https://api.datamuse.com/words?rel_syn=${word}&max=4`);
    const synData = await synRes.json();
    const synonyms = synData.map(item => item.word);

    // 3. Fetch antonyms from Datamuse (using "rel_ant" for related words)
    const antRes = await fetch(`https://api.datamuse.com/words?rel_ant=${word}&max=4`);
    const antData = await antRes.json();
    const antonyms = antData.map(item => item.word);

    return { partOfSpeech, definition, synonyms, antonyms };
  } catch (e) { 
    return null; 
  }
}



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
  


  // create the text display DIV
  const textDisplay = document.createElement("div");
  textDisplay.style.marginTop = "15px";
  textDisplay.innerHTML = "<em>Loading...</em>";
  translationBox.appendChild(textDisplay);

  //add the save button
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
    // 1. Translate the word to English
    translatedWord = (await translate(text)) || text;
    
    
    
    // 2. Look up the English word
    if (text.split(" ").length === 1) {
      
      // FIX: Remove ALL spaces, punctuation, and make it lowercase
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
           // SHOW THIS SO YOU KNOW THE DICTIONARY FAILED
           definitionHtml = `<div style="color: red; font-size: 11px;">Could not find definition for "${cleanEnglishWord}"</div>`;
        }
      }
    }

    // 3. Show original word if it was translated
    let originalHtml = "";
    if (text !== translatedWord) {
      originalHtml = `<div style="font-size: 11px; color: #999; margin-top: 10px; text-align: right;">Original: ${text}</div>`;
    }

    // 4. Update the box
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
    // ADD THIS CHECK:
    if (!chrome.runtime?.id) {
      saveButton.textContent = "Refresh page!";
      saveButton.style.backgroundColor = "#dc3545"; // red
      return;
    }
    saveButton.textContent = "saved!";
    saveButton.disabled = true;
    saveButton.style.backgroundColor = "#28a745"; // Turn green
    const key = `phrase:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const plaindefinition = definitionHtml ? definitionHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() 
      : "No definition found.";
    await chrome.storage.local.set({
      [key]: {
        originalText : text,
        translatedWord : translatedWord,
        definition : plaindefinition,
        url: location.href,
        savedAt: new Date().toISOString()

      }
    });
  
  });

  // Each saved phrase is a separate entry in Chrome's local storage.
//   const key = `phrase:${Date.now()}:${Math.random().toString(36).slice(2)}`;
//   try {
//     await chrome.storage.local.set({
//       [key]: {
//         text,
//         url: location.href,
//         savedAt: new Date().toISOString()
//       }
//     });
//   } catch (error) {
//     console.error("Could not save selected text:", error);
//   }
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
