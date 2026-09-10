let localStream = null;
let currentCall = null;
let incomingCall = null;
let peerReady = false;
let ringtoneStarted = false;

const myIdEl = document.getElementById("my-id");
const peerIdInput = document.getElementById("peer-id-input");
const callBtn = document.getElementById("call-btn");
const hangupBtn = document.getElementById("hangup-btn");
const copyBtn = document.getElementById("copy-btn");
const callStatus = document.getElementById("call-status");
const remoteAudio = document.getElementById("remote-audio");

const incomingCallBox = document.getElementById("incoming-call");
const incomingFrom = document.getElementById("incoming-from");
const answerBtn = document.getElementById("answer-btn");
const rejectBtn = document.getElementById("reject-btn");
const ringtone = document.getElementById("ringtone");

const peer = new Peer();

function setStatus(message) {
  callStatus.textContent = message;
}

function updateButtons() {
  callBtn.disabled = !peerReady || !localStream || !!currentCall;
  hangupBtn.disabled = !currentCall;
  copyBtn.disabled = !peerReady || !myIdEl.textContent || myIdEl.textContent === "Generando ID...";
}

async function ensureMicrophone() {
  if (localStream) return true;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setStatus("Este navegador no permite acceder al micrófono.");
    return false;
  }

  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    updateButtons();
    return true;
  } catch (error) {
    console.error(error);
    setStatus("No se pudo acceder al micrófono. Revisa el permiso del navegador.");
    return false;
  }
}

async function startRingtone() {
  try {
    ringtone.currentTime = 0;
    await ringtone.play();
    ringtoneStarted = true;
  } catch (error) {
    // Algunos navegadores bloquean audio automático.
    // El sonido comenzará cuando el usuario pulse Aceptar/Rechazar.
    console.warn("El navegador bloqueó el sonido automático:", error);
  }
}

function stopRingtone() {
  ringtone.pause();
  ringtone.currentTime = 0;
  ringtoneStarted = false;
}

function showIncomingCall(call) {
  incomingCall = call;
  incomingFrom.textContent = "ID: " + (call.peer || "dispositivo desconocido");
  incomingCallBox.classList.remove("hidden");
  setStatus("📞 Llamada entrante...");
  startRingtone();
}

function hideIncomingCall() {
  incomingCallBox.classList.add("hidden");
  stopRingtone();
}

peer.on("open", async (id) => {
  peerReady = true;
  myIdEl.textContent = id;
  setStatus("Listo para llamar.");
  updateButtons();

  await ensureMicrophone();
});

peer.on("error", (error) => {
  console.error("PeerJS:", error);
  setStatus("Error de conexión: " + (error.message || "desconocido"));
  updateButtons();

  if (incomingCall) {
    incomingCall.close();
    incomingCall = null;
    hideIncomingCall();
  }
});

peer.on("disconnected", () => {
  peerReady = false;
  setStatus("Se perdió la conexión. Intentando reconectar...");
  updateButtons();

  try {
    peer.reconnect();
  } catch (error) {
    console.error(error);
  }
});

peer.on("close", () => {
  peerReady = false;
  setStatus("La conexión con el servicio se cerró.");
  updateButtons();
});

peer.on("call", async (call) => {
  if (currentCall || incomingCall) {
    call.close();
    return;
  }

  incomingCall = call;
  showIncomingCall(call);

  // Por seguridad, si la persona rechaza o acepta se decide desde los botones.
});

answerBtn.addEventListener("click", async () => {
  if (!incomingCall) return;

  stopRingtone();

  const call = incomingCall;
  incomingCall = null;
  hideIncomingCall();

  const microphoneReady = await ensureMicrophone();

  if (!microphoneReady) {
    call.close();
    return;
  }

  currentCall = call;
  updateButtons();

  try {
    call.answer(localStream);
    setupCallHandlers(call);
    setStatus("Conectando llamada...");
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
  const remoteId = peerIdInput.value.trim();

  if (!remoteId) {
    window.alert("Introduce el ID del dispositivo al que quieres llamar.");
    return;
  }

  if (!peerReady) {
    window.alert("Todavía no estamos conectados al servicio.");
    return;
  }

  const microphoneReady = await ensureMicrophone();
  if (!microphoneReady) return;

  try {
    setStatus("📞 Llamando...");
    currentCall = peer.call(remoteId, localStream);
    setupCallHandlers(currentCall);
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

copyBtn.addEventListener("click", async () => {
  const id = myIdEl.textContent;

  if (!peerReady || !id || id === "Generando ID...") return;

  try {
    await navigator.clipboard.writeText(id);
    setStatus("ID copiado al portapapeles.");
  } catch {
    setStatus("No se pudo copiar automáticamente. Copia el ID manualmente.");
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
      console.warn("El navegador bloqueó el audio remoto:", error);
    }

    setStatus("📞 Llamada en curso...");
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
});
