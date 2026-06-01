/*
    Aplicación de práctica de Código Morse
    --------------------------------------------------
    - No usa frameworks ni servidores externos.
    - Usa Web Audio API para generar tonos Morse.
    - Usa eventos de teclado, mouse y táctil mediante Pointer Events.
    - Mantiene una lógica modular para conversión, audio, entrada manual,
      historial, tema visual y modo práctica.
*/

// Tabla Morse internacional básica. Incluye letras españolas frecuentes y números.
const MORSE_TABLE = {
    "A": ".-", "B": "-...", "C": "-.-.", "D": "-..", "E": ".",
    "F": "..-.", "G": "--.", "H": "....", "I": "..", "J": ".---",
    "K": "-.-", "L": ".-..", "M": "--", "N": "-.", "Ñ": "--.--",
    "O": "---", "P": ".--.", "Q": "--.-", "R": ".-.", "S": "...",
    "T": "-", "U": "..-", "V": "...-", "W": ".--", "X": "-..-",
    "Y": "-.--", "Z": "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "!": "-.-.--", "/": "-..-.",
    "(": "-.--.", ")": "-.--.-", "&": ".-...", ":": "---...", ";": "-.-.-.",
    "=": "-...-", "+": ".-.-.", "-": "-....-", "_": "..--.-", "\"": ".-..-.",
    "$": "...-..-", "@": ".--.-."
};

// Tabla inversa para traducir Morse a texto.
const TEXT_TABLE = Object.fromEntries(
    Object.entries(MORSE_TABLE).map(([letter, code]) => [code, letter])
);

// Palabras simples para el modo práctica.
const PRACTICE_WORDS = [
    "CASA", "TREN", "METRO", "SOL", "LUNA", "RADIO", "MORSE", "PRUEBA", "CHILE", "CODIGO"
];

const elements = {
    textInput: document.getElementById("textInput"),
    morseVisual: document.getElementById("morseVisual"),
    playButton: document.getElementById("playButton"),
    stopButton: document.getElementById("stopButton"),
    clearTextButton: document.getElementById("clearTextButton"),
    speedRange: document.getElementById("speedRange"),
    speedValue: document.getElementById("speedValue"),
    frequencyRange: document.getElementById("frequencyRange"),
    frequencyValue: document.getElementById("frequencyValue"),
    morseKey: document.getElementById("morseKey"),
    currentMorse: document.getElementById("currentMorse"),
    recognizedText: document.getElementById("recognizedText"),
    feedback: document.getElementById("feedback"),
    newLetterButton: document.getElementById("newLetterButton"),
    newWordButton: document.getElementById("newWordButton"),
    clearManualButton: document.getElementById("clearManualButton"),
    historyList: document.getElementById("historyList"),
    clearHistoryButton: document.getElementById("clearHistoryButton"),
    practiceWord: document.getElementById("practiceWord"),
    newPracticeButton: document.getElementById("newPracticeButton"),
    checkPracticeButton: document.getElementById("checkPracticeButton"),
    practiceFeedback: document.getElementById("practiceFeedback"),
    themeToggle: document.getElementById("themeToggle")
};

let audioContext = null;
let activeOscillators = [];
let isManualPressing = false;
let manualPressStart = 0;
let currentManualCode = "";
let recognizedText = "";
let letterSilenceTimer = null;
let wordSilenceTimer = null;
let currentPracticeWord = "CASA";

function normalizeText(text) {
    return text
        .toUpperCase()
        .replace(/[ÁÀÂÄ]/g, "A")
        .replace(/[ÉÈÊË]/g, "E")
        .replace(/[ÍÌÎÏ]/g, "I")
        .replace(/[ÓÒÔÖ]/g, "O")
        .replace(/[ÚÙÛÜ]/g, "U");
}

function textToMorse(text) {
    return normalizeText(text)
        .split("")
        .map(char => {
            if (char === " ") return "/";
            return MORSE_TABLE[char] || "";
        })
        .filter(Boolean)
        .join(" ");
}

function morseToText(morse) {
    return morse
        .trim()
        .split(" ")
        .map(code => {
            if (code === "/") return " ";
            return TEXT_TABLE[code] || "?";
        })
        .join("");
}

function renderMorseVisual(morse) {
    elements.morseVisual.innerHTML = "";

    if (!morse) {
        elements.morseVisual.classList.add("empty");
        elements.morseVisual.textContent = "Escribe texto para ver el Morse aquí.";
        return;
    }

    elements.morseVisual.classList.remove("empty");

    morse.split(" ").forEach(group => {
        if (group === "/") {
            const space = document.createElement("span");
            space.className = "word-space";
            elements.morseVisual.appendChild(space);
            return;
        }

        const letter = document.createElement("span");
        letter.className = "letter-group";

        group.split("").forEach(symbol => {
            const mark = document.createElement("span");
            mark.className = symbol === "." ? "dot" : "dash";
            letter.appendChild(mark);
        });

        elements.morseVisual.appendChild(letter);
    });
}

function updateTextConversion() {
    const morse = textToMorse(elements.textInput.value);
    renderMorseVisual(morse);
}

function getTimingConfig() {
    // Fórmula estándar aproximada: duración del punto en ms = 1200 / WPM.
    const wpm = Number(elements.speedRange.value);
    const dot = 1200 / wpm;

    return {
        dot,
        dash: dot * 3,
        symbolGap: dot,
        letterGap: dot * 3,
        wordGap: dot * 7,
        frequency: Number(elements.frequencyRange.value)
    };
}

function ensureAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    if (audioContext.state === "suspended") {
        audioContext.resume();
    }

    return audioContext;
}

function playTone(startTime, durationSeconds, frequency) {
    const context = ensureAudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, startTime);

    // Pequeño fade in/out para evitar clicks molestos.
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.28, startTime + 0.01);
    gain.gain.setValueAtTime(0.28, startTime + Math.max(0.01, durationSeconds - 0.01));
    gain.gain.linearRampToValueAtTime(0, startTime + durationSeconds);

    oscillator.connect(gain);
    gain.connect(context.destination);

    oscillator.start(startTime);
    oscillator.stop(startTime + durationSeconds + 0.02);
    activeOscillators.push(oscillator);
}

function stopAudio() {
    activeOscillators.forEach(osc => {
        try { osc.stop(); } catch (_) { /* Ignora osciladores ya detenidos. */ }
    });
    activeOscillators = [];
}

function playMorse(morse) {
    stopAudio();

    if (!morse) {
        setFeedback(elements.feedback, "neutral", "No hay texto para reproducir.");
        return;
    }

    const config = getTimingConfig();
    const context = ensureAudioContext();
    let time = context.currentTime + 0.08;

    morse.split(" ").forEach(group => {
        if (group === "/") {
            time += config.wordGap / 1000;
            return;
        }

        group.split("").forEach(symbol => {
            const duration = symbol === "." ? config.dot : config.dash;
            playTone(time, duration / 1000, config.frequency);
            time += (duration + config.symbolGap) / 1000;
        });

        time += config.letterGap / 1000;
    });
}

function playClickSymbol(symbol) {
    const config = getTimingConfig();
    const context = ensureAudioContext();
    const duration = symbol === "." ? config.dot : config.dash;
    playTone(context.currentTime, duration / 1000, config.frequency);
}

function setFeedback(element, type, message) {
    element.className = `feedback ${type}`;
    element.textContent = message;
}

function updateManualDisplay() {
    elements.currentMorse.textContent = currentManualCode || "—";
    elements.recognizedText.textContent = recognizedText || "—";
}

function clearSilenceTimers() {
    clearTimeout(letterSilenceTimer);
    clearTimeout(wordSilenceTimer);
}

function scheduleAutomaticSeparation() {
    clearSilenceTimers();
    const config = getTimingConfig();

    // Después de una pausa equivalente a separación de letras, se intenta cerrar la letra.
    letterSilenceTimer = setTimeout(() => {
        closeCurrentLetter(false);
    }, config.letterGap + 200);

    // Después de una pausa mayor, se agrega espacio de palabra si ya existe texto reconocido.
    wordSilenceTimer = setTimeout(() => {
        if (recognizedText && !recognizedText.endsWith(" ")) {
            recognizedText += " ";
            updateManualDisplay();
            setFeedback(elements.feedback, "neutral", "Pausa larga detectada: espacio de palabra agregado.");
        }
    }, config.wordGap + 500);
}

function startManualPress(event) {
    event.preventDefault();
    if (isManualPressing) return;

    clearSilenceTimers();
    isManualPressing = true;
    manualPressStart = performance.now();
    elements.morseKey.classList.add("pressed");
    elements.morseKey.textContent = "Soltar para registrar";
    setFeedback(elements.feedback, "neutral", "Pulsación en curso...");
}

function endManualPress(event) {
    event.preventDefault();
    if (!isManualPressing) return;

    const config = getTimingConfig();
    const duration = performance.now() - manualPressStart;
    const threshold = config.dot * 2;
    const symbol = duration < threshold ? "." : "-";

    isManualPressing = false;
    elements.morseKey.classList.remove("pressed");
    elements.morseKey.textContent = "Mantener presionado";

    currentManualCode += symbol;
    playClickSymbol(symbol);
    updateManualDisplay();

    const possibleLetter = TEXT_TABLE[currentManualCode];
    if (possibleLetter) {
        setFeedback(elements.feedback, "success", `Código válido hasta ahora: ${currentManualCode} = ${possibleLetter}`);
    } else {
        setFeedback(elements.feedback, "error", `Código no reconocido todavía: ${currentManualCode}. Prueba cerrar o corregir.`);
    }

    scheduleAutomaticSeparation();
}

function closeCurrentLetter(addToHistory = true) {
    clearSilenceTimers();

    if (!currentManualCode) {
        setFeedback(elements.feedback, "neutral", "No hay símbolo pendiente para cerrar.");
        return;
    }

    const letter = TEXT_TABLE[currentManualCode];
    if (!letter) {
        setFeedback(elements.feedback, "error", `No existe una letra para el código ${currentManualCode}. Se descartó el símbolo.`);
        addHistory(`Error: ${currentManualCode} no reconocido`);
        currentManualCode = "";
        updateManualDisplay();
        return;
    }

    recognizedText += letter;
    if (addToHistory) addHistory(`${currentManualCode} → ${letter}`);
    currentManualCode = "";
    updateManualDisplay();
    setFeedback(elements.feedback, "success", `Letra reconocida: ${letter}`);
}

function addWordSpace() {
    closeCurrentLetter(false);

    if (recognizedText && !recognizedText.endsWith(" ")) {
        recognizedText += " ";
        updateManualDisplay();
        addHistory("Espacio de palabra");
        setFeedback(elements.feedback, "neutral", "Espacio de palabra agregado.");
    }
}

function clearManualPractice() {
    clearSilenceTimers();
    currentManualCode = "";
    recognizedText = "";
    updateManualDisplay();
    setFeedback(elements.feedback, "neutral", "Práctica manual reiniciada.");
}

function addHistory(text) {
    const item = document.createElement("li");
    const time = new Date().toLocaleTimeString();
    item.textContent = `[${time}] ${text}`;
    elements.historyList.prepend(item);

    while (elements.historyList.children.length > 30) {
        elements.historyList.removeChild(elements.historyList.lastChild);
    }
}

function choosePracticeWord() {
    const index = Math.floor(Math.random() * PRACTICE_WORDS.length);
    currentPracticeWord = PRACTICE_WORDS[index];
    elements.practiceWord.textContent = currentPracticeWord;
    clearManualPractice();
    setFeedback(elements.practiceFeedback, "neutral", "Escribe la palabra objetivo usando Morse.");
}

function checkPractice() {
    closeCurrentLetter(false);
    const typed = recognizedText.trim().toUpperCase();

    if (typed === currentPracticeWord) {
        setFeedback(elements.practiceFeedback, "success", `Correcto: escribiste ${typed}.`);
        addHistory(`Práctica correcta: ${currentPracticeWord}`);
    } else {
        const expected = textToMorse(currentPracticeWord);
        setFeedback(
            elements.practiceFeedback,
            "error",
            `Resultado: ${typed || "vacío"}. Esperado: ${currentPracticeWord}. Morse esperado: ${expected}`
        );
        addHistory(`Práctica incorrecta: ${typed || "vacío"} / esperado ${currentPracticeWord}`);
    }
}

function toggleTheme() {
    document.body.classList.toggle("dark");
    const isDark = document.body.classList.contains("dark");
    elements.themeToggle.textContent = isDark ? "☀ Tema claro" : "🌙 Tema oscuro";
    localStorage.setItem("morse-theme", isDark ? "dark" : "light");
}

function loadTheme() {
    const savedTheme = localStorage.getItem("morse-theme");
    if (savedTheme === "dark") {
        document.body.classList.add("dark");
        elements.themeToggle.textContent = "☀ Tema claro";
    }
}

function bindEvents() {
    elements.textInput.addEventListener("input", updateTextConversion);

    elements.playButton.addEventListener("click", () => {
        const morse = textToMorse(elements.textInput.value);
        playMorse(morse);
    });

    elements.stopButton.addEventListener("click", stopAudio);

    elements.clearTextButton.addEventListener("click", () => {
        elements.textInput.value = "";
        updateTextConversion();
    });

    elements.speedRange.addEventListener("input", () => {
        elements.speedValue.textContent = elements.speedRange.value;
    });

    elements.frequencyRange.addEventListener("input", () => {
        elements.frequencyValue.textContent = elements.frequencyRange.value;
    });

    // Pointer Events funciona con mouse, lápiz y pantalla táctil.
    elements.morseKey.addEventListener("pointerdown", startManualPress);
    elements.morseKey.addEventListener("pointerup", endManualPress);
    elements.morseKey.addEventListener("pointercancel", endManualPress);
    elements.morseKey.addEventListener("pointerleave", event => {
        if (isManualPressing) endManualPress(event);
    });

    // Entrada por barra espaciadora para PC.
    document.addEventListener("keydown", event => {
        if (event.code === "Space" && !event.repeat && document.activeElement !== elements.textInput) {
            startManualPress(event);
        }
    });

    document.addEventListener("keyup", event => {
        if (event.code === "Space" && document.activeElement !== elements.textInput) {
            endManualPress(event);
        }
    });

    elements.newLetterButton.addEventListener("click", () => closeCurrentLetter(true));
    elements.newWordButton.addEventListener("click", addWordSpace);
    elements.clearManualButton.addEventListener("click", clearManualPractice);

    elements.clearHistoryButton.addEventListener("click", () => {
        elements.historyList.innerHTML = "";
    });

    elements.newPracticeButton.addEventListener("click", choosePracticeWord);
    elements.checkPracticeButton.addEventListener("click", checkPractice);
    elements.themeToggle.addEventListener("click", toggleTheme);
}

function init() {
    loadTheme();
    bindEvents();
    updateTextConversion();
    updateManualDisplay();
}

init();
