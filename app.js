let localStream = null;
let currentCall = null;
let incomingCall = null;
let peer = null;
let username = "";
let ringtonePlaying = false;

const loginPanel = document.getElementById("login-panel");
const appPanel = document.getElementById("app-panel");
const usernameInput = document.getElementById("username-input");
const startBtn = document.getElementById("start-btn");
const myUsername = document.getElementById("my-username");

const peerUsernameInput = document.getElementById("peer-username-input");
const callBtn = document.getElementById("call-btn");
const hangupBtn = document.getElementById("hangup-btn");
const callStatus = document.getElementById("call-status");

const incomingCallBox = document.getElementById("incoming-call");
const incomingFrom = document.getElementById("incoming-from");
const answerBtn = document.getElementById("answer-btn");
const rejectBtn = document.getElementById("reject-btn");

const remoteAudio = document.getElementById("remote-audio");
const ringtone = document.getElementById("ringtone");

function setStatus(message) {
  callStatus.textContent = message;
}

function normaliseUsername(value) {
  return value.trim().toLowerCase();
}

function isValidUsername(value) {
  return /^[a-zA-Z0-9_-]{2,24}$/.test(value);
}

function displayUsername(value) {
  // Mostramos el nombre en mayúsculas, pero internamente usamos minúsculas.
  return value.toUpperCase();
}

async function getMicrophone() {
  if (localStream) return true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Este navegador no permite usar el micrófono.");
    return false;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });
    return true;
  } catch (error) {
    console.error(error);
    setStatus("No hay permiso para usar el micrófono.");
    return false;
  }
}

function updateButtons() {
  callBtn.disabled = !peer || !!currentCall || !localStream;
  hangupBtn.disabled = !currentCall;
}

async function startRingtone() {
  try {
    ringtone.currentTime = 0;
    await ringtone.play();
    ringtonePlaying = true;
  } catch (error) {
    // Los navegadores pueden bloquear sonido automático.
    console.warn("No se pudo iniciar el sonido automáticamente:", error);
  }
}

function stopRingtone() {
  ringtone.pause();
  ringtone.currentTime = 0;
  ringtonePlaying = false;
}

function showIncomingCall(call) {
  incomingCall = call;
  incomingFrom.textContent = `${displayUsername(call.peer)} te está llamando.`;
  incomingCallBox.classList.remove("hidden");
  setStatus(`📞 Llamada de ${displayUsername(call.peer)}`);
  startRingtone();
}

function hideIncomingCall() {
  incomingCallBox.classList.add("hidden");
  stopRingtone();
}

startBtn.addEventListener("click", async () => {
  const rawUsername = usernameInput.value.trim();

  if (!isValidUsername(rawUsername)) {
    alert("El usuario debe tener entre 2 y 24 caracteres y usar solo letras, números, guion o guion bajo.");
    return;
  }

  username = normaliseUsername(rawUsername);
  startBtn.disabled = true;
  setStatus("Conectando...");

  try {
    /*
     * Usamos el nombre de usuario como ID de PeerJS.
     * Así no hace falta copiar un ID extraño.
     */
    peer = new Peer(username);

    peer.on("open", async () => {
      loginPanel.classList.add("hidden");
      appPanel.classList.remove("hidden");
      myUsername.textContent = displayUsername(username);

      const micOK = await getMicrophone();

      if (micOK) {
        setStatus("🟢 Conectado. Listo para llamar.");
        updateButtons();
      } else {
        setStatus("Conectado, pero falta permiso para el micrófono.");
        updateButtons();
      }
    });

    peer.on("call", (call) => {
      if (currentCall || incomingCall) {
        call.close();
        return;
      }

      showIncomingCall(call);
    });

    peer.on("error", (error) => {
      console.error("PeerJS:", error);

      if (error.type === "unavailable-id") {
        alert("Ese nombre de usuario ya está en uso. Elige otro.");
        window.location.reload();
        return;
      }

      setStatus("Error de conexión: " + (error.message || "desconocido"));
    });

    peer.on("disconnected", () => {
      setStatus("Conexión perdida. Intentando reconectar...");

      try {
        peer.reconnect();
      } catch (error) {
        console.error(error);
      }
    });

  } catch (error) {
    console.error(error);
    startBtn.disabled = false;
    setStatus("No se pudo iniciar.");
  }
});

answerBtn.addEventListener("click", async () => {
  if (!incomingCall) return;

  stopRingtone();

  const call = incomingCall;
  incomingCall = null;
  hideIncomingCall();

  const micOK = await getMicrophone();

  if (!micOK) {
    call.close();
    return;
  }

  currentCall = call;
  updateButtons();

  try {
    call.answer(localStream);
    setupCallHandlers(call);
    setStatus(`📞 Hablando con ${displayUsername(call.peer)}...`);
  } catch (error) {
    console.error(error);
    call.close();
    cleanupCall();
  }
});

rejectBtn.addEventListener("click", () => {
  if (incomingCall) {
    incomingCall.close();
    incomingCall = null;
  }

  hideIncomingCall();
  setStatus("Llamada rechazada.");
});

callBtn.addEventListener("click", async () => {
  const rawTarget = peerUsernameInput.value.trim();

  if (!isValidUsername(rawTarget)) {
    alert("Introduce un nombre de usuario válido.");
    return;
  }

  const target = normaliseUsername(rawTarget);

  if (target === username) {
    alert("No puedes llamarte a ti mismo.");
    return;
  }

  const micOK = await getMicrophone();
  if (!micOK) return;

  try {
    currentCall = peer.call(target, localStream);

    if (!currentCall) {
      setStatus("No se pudo iniciar la llamada.");
      return;
    }

    setupCallHandlers(currentCall);
    setStatus(`📞 Llamando a ${displayUsername(target)}...`);
  } catch (error) {
    console.error(error);
    currentCall = null;
    updateButtons();
    setStatus("No se pudo iniciar la llamada.");
  }
});

hangupBtn.addEventListener("click", () => {
  if (currentCall) {
    currentCall.close();
  }
});

function setupCallHandlers(call) {
  currentCall = call;
  updateButtons();

  call.on("stream", async (remoteStream) => {
    remoteAudio.srcObject = remoteStream;

    try {
      await remoteAudio.play();
    } catch (error) {
      console.warn("El navegador bloqueó la reproducción:", error);
    }

    setStatus(`📞 Hablando con ${displayUsername(call.peer)}...`);
  });

  call.on("close", () => {
    cleanupCall();
  });

  call.on("error", (error) => {
    console.error("Llamada:", error);
    setStatus("Error en la llamada: " + (error.message || "desconocido"));
    cleanupCall();
  });
}

function cleanupCall() {
  stopRingtone();

  currentCall = null;
  remoteAudio.srcObject = null;

  if (incomingCall) {
    incomingCall.close();
    incomingCall = null;
  }

  hideIncomingCall();
  setStatus("Llamada finalizada. Listo para otra llamada.");
  updateButtons();
}

window.addEventListener("beforeunload", () => {
  stopRingtone();

  if (currentCall) currentCall.close();
  if (incomingCall) incomingCall.close();

  if (localStream) {
    localStream.getTracks().forEach((track) => track.stop());
  }

  if (peer && !peer.destroyed) {
    peer.destroy();
  }
});
