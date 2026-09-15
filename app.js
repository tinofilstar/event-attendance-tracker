(function () {
  "use strict";
  var SECRET = "EAT_SECRET_2026";
  var APP_BASE = "https://cdn.jsdelivr.net/gh/tinofilstar/event-attendance-tracker@main/index.html";
  var subjects = {
    FDS102: {
      name: "FDS102 Teaching Studies 1B",
      slots: [
        { day: 2, start: "08:00", end: "08:50", room: "A101" },
        { day: 2, start: "09:00", end: "09:50", room: "A101" }
      ]
    }
  };
  var lecturerStatus = document.getElementById("lecturerStatus");
  var studentStatus = document.getElementById("studentStatus");
  var hostStatus = document.getElementById("hostStatus");
  var subjectSelect = document.getElementById("subjectSelect");
  var qrBox = document.getElementById("qrBox");
  var hostQrList = document.getElementById("hostQrList");
  var slotMeta = document.getElementById("slotMeta");
  var hostMeta = document.getElementById("hostMeta");
  var forceTest = false;
  var pendingToken = "";
  var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  var recognition = null;
  var activeMicBtn = null;
  function showStatus(el, msg, type) { el.textContent = msg; el.className = "status show " + (type || "info"); }
  function hideStatus(el) { el.className = "status"; el.textContent = ""; }
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function toMinutes(t) { var p = (t || "00:00").split(":"); return parseInt(p[0], 10) * 60 + parseInt(p[1], 10); }
  function dateToYMD(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function ymdToDate(s) { var p = s.split("-"); return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)); }
  function addDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
  function getActiveSlot(code) {
    var subj = subjects[code]; if (!subj) return null;
    var now = new Date(); var day = now.getDay(); var mins = now.getHours() * 60 + now.getMinutes();
    if (forceTest) return subj.slots[0];
    var i, s, upcoming = null;
    for (i = 0; i < subj.slots.length; i++) { s = subj.slots[i]; if (s.day === day && mins >= toMinutes(s.start) && mins <= toMinutes(s.end)) return s; }
    for (i = 0; i < subj.slots.length; i++) { s = subj.slots[i]; if (s.day === day && toMinutes(s.start) > mins) { if (!upcoming || toMinutes(s.start) < toMinutes(upcoming.start)) upcoming = s; } }
    return upcoming || subj.slots[0];
  }
  function b64url(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function fromB64url(str) { var p = str.length % 4 === 0 ? "" : "====".slice(str.length % 4); return decodeURIComponent(escape(atob(str.replace(/-/g, "+").replace(/_/g, "/") + p))); }
  function sign(payload) { var h = 0, data = payload + SECRET, i; for (i = 0; i < data.length; i++) { h = ((h << 5) - h) + data.charCodeAt(i); h |= 0; } return (h >>> 0).toString(16); }
  function makeLink(token) { return APP_BASE + "#t=" + encodeURIComponent(token); }
  function extractToken(raw) {
    raw = (raw || "").trim(); if (!raw) return "";
    var hash = raw.indexOf("#t="); if (hash >= 0) return decodeURIComponent(raw.slice(hash + 3).split("&")[0]);
    var q = raw.indexOf("?t="); if (q >= 0) return decodeURIComponent(raw.slice(q + 3).split("&")[0]);
    return raw;
  }
  function drawQR(container, text, size) {
    container.innerHTML = "";
    if (typeof QRCode === "undefined") { container.textContent = "QR library failed. Check internet."; return false; }
    try { new QRCode(container, { text: text, width: size || 196, height: size || 196, correctLevel: QRCode.CorrectLevel.M }); return true; }
    catch (e) { container.textContent = "Could not draw QR."; return false; }
  }
  function generateQR() {
    var code = subjectSelect.value; var slot = getActiveSlot(code);
    if (!slot) { showStatus(lecturerStatus, "No slot found.", "err"); return; }
    var exp = Math.floor(Date.now() / 1000) + 1800;
    var payload = code + "|" + slot.start + "|" + slot.end + "|" + slot.room + "|" + exp;
    var token = b64url(payload + "|" + sign(payload));
    if (!drawQR(qrBox, makeLink(token), 196)) { showStatus(lecturerStatus, "QR library failed. Check internet.", "err"); return; }
    var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    slotMeta.textContent = subjects[code].name + " | " + days[slot.day] + " " + slot.start + "-" + slot.end + " | " + slot.room + (forceTest ? " (TEST)" : "");
    hideStatus(lecturerStatus);
  }
  function generateHostQR() {
    var title = document.getElementById("eventTitle").value.trim().replace(/\|/g, "/");
    var startDate = document.getElementById("eventStartDate").value;
    var endDate = document.getElementById("eventEndDate").value;
    var start = document.getElementById("eventStart").value;
    var end = document.getElementById("eventEnd").value;
    var loc = document.getElementById("eventLocation").value.trim().replace(/\|/g, "/");
    if (!title) { showStatus(hostStatus, "Enter an event title.", "err"); return; }
    if (!startDate || !endDate) { showStatus(hostStatus, "Pick start and end dates.", "err"); return; }
    if (!start || !end) { showStatus(hostStatus, "Set daily times.", "err"); return; }
    if (!loc) { showStatus(hostStatus, "Enter a location.", "err"); return; }
    if (toMinutes(end) <= toMinutes(start)) { showStatus(hostStatus, "End time must be after start.", "err"); return; }
    var sd = ymdToDate(startDate), ed = ymdToDate(endDate);
    if (ed < sd) { showStatus(hostStatus, "End date must be on or after start date.", "err"); return; }
    var days = [], cur = new Date(sd.getTime()), dayNum = 1;
    while (cur <= ed) { days.push({ date: dateToYMD(cur), dayNum: dayNum }); cur = addDays(cur, 1); dayNum++; }
    var eventId = "E" + Date.now().toString(36);
    hostQrList.innerHTML = "";
    days.forEach(function (d) {
      var dayEnd = ymdToDate(d.date); var ep = end.split(":");
      dayEnd.setHours(parseInt(ep[0], 10), parseInt(ep[1], 10), 59, 0);
      var exp = Math.floor(dayEnd.getTime() / 1000);
      var payload = "HOST|" + eventId + "|" + d.dayNum + "|" + d.date + "|" + start + "|" + end + "|" + loc + "|" + exp + "|" + title;
      var token = b64url(payload + "|" + sign(payload));
      var wrap = document.createElement("div");
      wrap.className = "day-qr";
      wrap.innerHTML = "<h4>Day " + d.dayNum + " — " + d.date + "</h4><div class=\"meta\">" + start + "–" + end + " | " + loc + "</div><div class=\"dq-qr\"></div>";
      hostQrList.appendChild(wrap);
      drawQR(wrap.querySelector(".dq-qr"), makeLink(token), 164);
    });
    hostMeta.textContent = title + " | " + days.length + " day(s)";
    showStatus(hostStatus, "Generated " + days.length + " daily QR codes.", "ok");
  }
  function switchTab(role) {
    document.getElementById("lecturerTab").classList.remove("active");
    document.getElementById("hostTab").classList.remove("active");
    document.getElementById("studentTab").classList.remove("active");
    document.getElementById("lecturerCard").classList.add("hidden");
    document.getElementById("hostCard").classList.add("hidden");
    document.getElementById("studentCard").classList.add("hidden");
    if (role === "lecturer") { document.getElementById("lecturerTab").classList.add("active"); document.getElementById("lecturerCard").classList.remove("hidden"); }
    else if (role === "host") { document.getElementById("hostTab").classList.add("active"); document.getElementById("hostCard").classList.remove("hidden"); }
    else { document.getElementById("studentTab").classList.add("active"); document.getElementById("studentCard").classList.remove("hidden"); }
  }
  function loadRecords() { try { return JSON.parse(localStorage.getItem("eat_records_v1")) || []; } catch (e) { return []; } }
  function saveRecords(r) { localStorage.setItem("eat_records_v1", JSON.stringify(r)); }
  function loadProfile() {
    document.getElementById("studentId").value = localStorage.getItem("eat_sid") || "";
    document.getElementById("studentName").value = localStorage.getItem("eat_sname") || "";
  }
  function saveProfile() {
    localStorage.setItem("eat_sid", document.getElementById("studentId").value.trim());
    localStorage.setItem("eat_sname", document.getElementById("studentName").value.trim());
  }
  function renderRecords() {
    var recs = loadRecords(); var box = document.getElementById("records"); var countEl = document.getElementById("count");
    box.innerHTML = "";
    if (!recs.length) { countEl.textContent = "No scans yet on this phone."; return; }
    countEl.textContent = recs.length + " scan(s) on this phone.";
    recs.slice().reverse().forEach(function (r) {
      var d = document.createElement("div"); d.className = "record";
      d.innerHTML = "<strong>" + (r.studentId || "?") + "</strong> " + (r.studentName || "") + "<div class=\"meta\">" + new Date(r.timestamp).toLocaleString() + " | " + (r.subject || "") + " " + (r.slot || "") + "</div>";
      box.appendChild(d);
    });
  }
  function parseToken(raw) {
    try {
      var token = extractToken(raw); if (!token) return { error: "empty" };
      var decoded = fromB64url(token); var parts = decoded.split("|");
      if (parts.length < 6) return { error: "format" };
      var payload = parts.slice(0, parts.length - 1).join("|"); var sig = parts[parts.length - 1];
      if (sign(payload) !== sig) return { error: "signature" };
      var exp = parts[0] === "HOST" ? parseInt(parts[7], 10) : parseInt(parts[parts.length - 2], 10);
      if (isNaN(exp) || Math.floor(Date.now() / 1000) > exp) return { error: "expired" };
      if (parts[0] === "HOST") return { code: "HOST", dayNum: parts[2], start: parts[4], end: parts[5], room: parts[6], title: parts[8] || "" };
      return { code: parts[0], start: parts[1], end: parts[2], room: parts[3], dayNum: "", title: "" };
    } catch (e) { return { error: "format" }; }
  }
  function handleScan(raw) {
    var info = parseToken(raw);
    if (!info || info.error) {
      var msg = "Invalid QR.";
      if (info && info.error === "empty") msg = "No session found. Scan the lecturer QR with Camera.";
      if (info && info.error === "expired") msg = "This QR has expired. Ask for a new one.";
      if (info && info.error === "signature") msg = "This code is not from this tracker.";
      if (info && info.error === "format") msg = "Camera did not read a tracker QR.";
      showStatus(studentStatus, msg, "err"); return;
    }
    var sid = document.getElementById("studentId").value.trim();
    var sname = document.getElementById("studentName").value.trim();
    if (!sid) { pendingToken = extractToken(raw); showStatus(studentStatus, "Enter your student number, then tap Record scanned session.", "info"); return; }
    saveProfile();
    var recs = loadRecords();
    recs.push({ studentId: sid, studentName: sname, subject: info.code === "HOST" ? (info.title || "Event") : info.code, dayNum: info.dayNum || "", slot: (info.start || "") + "-" + (info.end || "") + (info.room ? " " + info.room : ""), timestamp: Date.now() });
    saveRecords(recs); renderRecords(); pendingToken = "";
    if (location.hash) history.replaceState(null, "", location.pathname + location.search);
    showStatus(studentStatus, "Attendance recorded.", "ok");
  }
  function startMic(btn) {
    var field = document.getElementById(btn.getAttribute("data-target")); if (!field) return;
    if (!SpeechRec) { showStatus(studentStatus, "Speech needs Chrome on Android.", "err"); return; }
    if (recognition) { try { recognition.stop(); } catch (e) {} recognition = null; if (activeMicBtn) activeMicBtn.classList.remove("recording"); if (activeMicBtn === btn) { activeMicBtn = null; return; } }
    recognition = new SpeechRec(); recognition.lang = "en-ZA"; recognition.interimResults = false; activeMicBtn = btn; btn.classList.add("recording");
    recognition.onresult = function (ev) { var text = ev.results[0][0].transcript; field.value = field.tagName === "TEXTAREA" && field.value ? field.value + " " + text : text; };
    recognition.onerror = function (ev) { showStatus(!document.getElementById("hostCard").classList.contains("hidden") ? hostStatus : studentStatus, ev.error === "not-allowed" ? "Microphone denied." : ("Mic: " + ev.error), "err"); };
    recognition.onend = function () { btn.classList.remove("recording"); recognition = null; activeMicBtn = null; };
    try { recognition.start(); } catch (e) { btn.classList.remove("recording"); }
  }
  function useGps() {
    if (!navigator.geolocation) { showStatus(hostStatus, "No GPS on this browser.", "err"); return; }
    showStatus(hostStatus, "Getting precise GPS…", "info");
    navigator.geolocation.getCurrentPosition(function (pos) {
      document.getElementById("eventLocation").value = pos.coords.latitude.toFixed(6) + ", " + pos.coords.longitude.toFixed(6) + " (±" + Math.round(pos.coords.accuracy) + "m)";
      showStatus(hostStatus, "GPS set.", "ok");
    }, function (err) { showStatus(hostStatus, err.code === 1 ? "Location denied. Choose Precise." : ("GPS: " + err.message), "err"); }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
  Object.keys(subjects).forEach(function (code) { var opt = document.createElement("option"); opt.value = code; opt.textContent = subjects[code].name; subjectSelect.appendChild(opt); });
  document.getElementById("lecturerTab").onclick = function () { switchTab("lecturer"); };
  document.getElementById("hostTab").onclick = function () { switchTab("host"); };
  document.getElementById("studentTab").onclick = function () { switchTab("student"); };
  document.getElementById("refreshBtn").onclick = generateQR;
  document.getElementById("testBtn").onclick = function () { forceTest = !forceTest; this.textContent = forceTest ? "Test Mode ON" : "Test Mode (force slot)"; generateQR(); };
  document.getElementById("hostGenerateBtn").onclick = generateHostQR;
  document.getElementById("gpsBtn").onclick = useGps;
  document.getElementById("confirmScanBtn").onclick = function () { handleScan(pendingToken || location.hash); };
  document.querySelectorAll(".mic-btn").forEach(function (btn) { btn.onclick = function () { startMic(btn); }; });
  var html5Qr = null;
  document.getElementById("cameraBtn").onclick = function () {
    var readerEl = document.getElementById("reader");
    if (html5Qr) { html5Qr.stop().catch(function () {}); html5Qr = null; readerEl.classList.add("hidden"); this.textContent = "Scan with this phone camera"; return; }
    if (typeof Html5Qrcode === "undefined") { showStatus(studentStatus, "Camera library needs internet.", "err"); return; }
    readerEl.classList.remove("hidden"); html5Qr = new Html5Qrcode("reader"); var btn = this;
    html5Qr.start({ facingMode: "environment" }, { fps: 8, qrbox: { width: 220, height: 220 } }, function (decoded) {
      html5Qr.stop().catch(function () {}); html5Qr = null; readerEl.classList.add("hidden"); btn.textContent = "Scan with this phone camera"; handleScan(decoded);
    }, function () {}).then(function () { btn.textContent = "Stop camera"; showStatus(studentStatus, "Point at the lecturer QR.", "info"); }).catch(function () {
      readerEl.classList.add("hidden"); html5Qr = null; showStatus(studentStatus, "Camera blocked. On iPhone open this page in Safari, then Allow Camera.", "err");
    });
  };
  loadProfile(); renderRecords(); generateQR();
  if (location.hash.indexOf("#t=") === 0) {
    pendingToken = extractToken(location.hash); switchTab("student");
    if (document.getElementById("studentId").value.trim()) handleScan(pendingToken);
    else showStatus(studentStatus, "QR received. Enter student number and tap Record scanned session.", "info");
  }
})();
