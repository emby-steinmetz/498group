let flashcards = [];
let currentIndex = 0;

const cardElement = document.getElementById('flashcard');
const frontElement = document.getElementById('front');
const backElement = document.getElementById('back');
const counterElement = document.getElementById('counter');

const prevButton = document.getElementById("prev");
const nextButton = document.getElementById("next");

// -----------------------------------------
// Load saved phrases from Chrome storage
// -----------------------------------------

async function loadFlashcards() {
    frontElement.textContent = "Loading Flashcards...";
    backElement.textContent = "";

    try {
        const stored = await chrome.storage.local.get(null);

        flashcards = Object.entries(stored)
            .filter(([key, value]) => {
                return (
                    key.startsWith("phrase:") &&
                    (
                        typeof value?.originalText === "string" ||
                        typeof value?.text === "string"
                    )
                );
            })
            .map(([, value]) => {
                return {
                    question: value.originalText || value.text,
                    answer: value.translatedWord || value.definition || ""
                };
            })
            .filter(card => card.question.trim() && card.answer.trim());

        // Start at the first card
        currentIndex = 0;

        updateCard();
    } catch (error) {
        console.error("Error loading flashcards:", error);

        frontElement.textContent = "Error loading flashcards.";
        backElement.textContent = "";
        counterElement.textContent = "0 / 0";
    }
}

// -----------------------------------------
// Display current flashcard
// -----------------------------------------

function updateCard() {
    // Temporarily disable animation and default to front
    cardElement.classList.add("no-transition");
    cardElement.classList.remove("flipped");

    if (flashcards.length === 0) {
        frontElement.textContent = "No flashcards available.";
        backElement.textContent = "";
        counterElement.textContent = "0 / 0";

        prevButton.disabled = true;
        nextButton.disabled = true;

        return;
    }
    
    const card = flashcards[currentIndex];

    frontElement.textContent = card.question;
    backElement.textContent = card.answer;
    counterElement.textContent = `${currentIndex + 1} / ${flashcards.length}`;

    prevButton.disabled = false;
    nextButton.disabled = false;

    // Force the browser to apply the reset
    void cardElement.offsetWidth;

    // Restore flip animation
    cardElement.classList.remove("no-transition");
}

// -----------------------------------------
// Flip card
// -----------------------------------------

function flipCard() {
    if (flashcards.length === 0) return;
    cardElement.classList.toggle("flipped");
}

// -----------------------------------------
// Next card
// -----------------------------------------

function nextCard() {
    if (flashcards.length === 0) return;
    currentIndex = (currentIndex + 1) % flashcards.length;
    updateCard();
}

// -----------------------------------------
// Previous card
// -----------------------------------------

function prevCard() {
    if (flashcards.length === 0) return;
    currentIndex = (currentIndex - 1 + flashcards.length) % flashcards.length;
    updateCard();
}

// -----------------------------------------
// Listen for changes to saved phrases
// -----------------------------------------

chrome.storage.onChanged.addListener((changes, area) => {
    if (
        area === "local" &&
        Object.keys(changes).some(key => key.startsWith("phrase:"))
    ) {
        void loadFlashcards();
    }
});

// -----------------------------------------
// Event listeners
// -----------------------------------------

document.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".card-container")
        .addEventListener("click", flipCard);

    prevButton.addEventListener("click", prevCard);
    nextButton.addEventListener("click", nextCard);

    void loadFlashcards();
});