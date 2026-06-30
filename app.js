const STORAGE_KEY = "habit-tap.habits.v2";
const LEGACY_STORAGE_KEY = "habit-tap.habits.v1";
const NOTIFIED_KEY = "habit-tap.notified.v1";

const state = {
  habits: [],
  editingId: null,
  noteHabitId: null,
  notified: {}
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  notifyButton: document.querySelector("#notifyButton"),
  doneCount: document.querySelector("#doneCount"),
  skipCount: document.querySelector("#skipCount"),
  pendingCount: document.querySelector("#pendingCount"),
  rateCount: document.querySelector("#rateCount"),
  formTitle: document.querySelector("#formTitle"),
  habitForm: document.querySelector("#habitForm"),
  habitName: document.querySelector("#habitName"),
  habitCategory: document.querySelector("#habitCategory"),
  habitColor: document.querySelector("#habitColor"),
  habitReminder: document.querySelector("#habitReminder"),
  submitButton: document.querySelector("#submitButton"),
  cancelEditButton: document.querySelector("#cancelEditButton"),
  noticeArea: document.querySelector("#noticeArea"),
  weekCalendar: document.querySelector("#weekCalendar"),
  habitList: document.querySelector("#habitList"),
  habitTotal: document.querySelector("#habitTotal"),
  emptyState: document.querySelector("#emptyState"),
  noteDialog: document.querySelector("#noteDialog"),
  noteTitle: document.querySelector("#noteTitle"),
  noteText: document.querySelector("#noteText"),
  saveNoteButton: document.querySelector("#saveNoteButton"),
  clearNoteButton: document.querySelector("#clearNoteButton")
};

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromOffset(offset) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + offset);
  return date;
}

function weekDays() {
  return Array.from({ length: 7 }, (_, index) => dateFromOffset(index - 6));
}

function normalizeHabit(habit, index) {
  return {
    id: habit.id || crypto.randomUUID(),
    name: habit.name || "無題の習慣",
    category: habit.category || "その他",
    color: habit.color || "#2f80ed",
    reminderTime: habit.reminderTime || "",
    createdAt: habit.createdAt || new Date().toISOString(),
    completions: habit.completions || {},
    skips: habit.skips || {},
    notes: habit.notes || {},
    order: Number.isFinite(habit.order) ? habit.order : index
  };
}

function formatToday() {
  els.todayLabel.textContent = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "full"
  }).format(new Date());
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY) || "[]";
  state.habits = JSON.parse(saved).map(normalizeHabit).sort((a, b) => a.order - b.order);
  state.notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
  saveHabits();
}

function saveHabits() {
  state.habits.forEach((habit, index) => {
    habit.order = index;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.habits));
}

function saveNotified() {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(state.notified));
}

function createHabit(formData) {
  return normalizeHabit({
    id: crypto.randomUUID(),
    name: formData.get("name").trim(),
    category: formData.get("category"),
    color: formData.get("color"),
    reminderTime: formData.get("reminder"),
    createdAt: new Date().toISOString()
  }, state.habits.length);
}

function statusFor(habit, key = todayKey()) {
  if (habit.completions[key]) return "done";
  if (habit.skips[key]) return "skip";
  return "pending";
}

function isDoneToday(habit) {
  return statusFor(habit) === "done";
}

function isSkippedToday(habit) {
  return statusFor(habit) === "skip";
}

function reminderIsDue(habit) {
  if (!habit.reminderTime || statusFor(habit) !== "pending") return false;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return current >= habit.reminderTime;
}

function streakCount(habit) {
  let count = 0;
  const cursor = new Date();
  while (statusFor(habit, todayKey(cursor)) === "done" || statusFor(habit, todayKey(cursor)) === "skip") {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return count;
}

function setStatus(id, status) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  const key = todayKey();
  delete habit.completions[key];
  delete habit.skips[key];
  if (status === "done") habit.completions[key] = true;
  if (status === "skip") habit.skips[key] = true;
  saveHabits();
  renderAll();
}

function updateSummary() {
  const total = state.habits.length;
  const done = state.habits.filter(isDoneToday).length;
  const skipped = state.habits.filter(isSkippedToday).length;
  const pending = total - done - skipped;
  const rate = total === 0 ? 0 : Math.round((done / total) * 100);
  els.doneCount.textContent = String(done);
  els.skipCount.textContent = String(skipped);
  els.pendingCount.textContent = String(pending);
  els.rateCount.textContent = `${rate}%`;
  els.habitTotal.textContent = `${total}件`;
}

function renderNotice() {
  const dueHabits = state.habits.filter(reminderIsDue);
  const notificationStatus = "Notification" in window ? Notification.permission : "unsupported";
  if (dueHabits.length === 0 && notificationStatus === "granted") {
    els.noticeArea.hidden = true;
    els.noticeArea.textContent = "";
    return;
  }
  if (notificationStatus === "unsupported") {
    els.noticeArea.hidden = false;
    els.noticeArea.textContent = "このブラウザでは通知を利用できません。未達成の習慣は一覧で強調表示します。";
    return;
  }
  if (notificationStatus !== "granted") {
    els.noticeArea.hidden = false;
    els.noticeArea.textContent = "通知を許可すると、設定時刻にリマインドを受け取れます。";
    return;
  }
  els.noticeArea.hidden = false;
  els.noticeArea.textContent = `リマインド時刻を過ぎた未達成の習慣: ${dueHabits.map((habit) => habit.name).join("、")}`;
}

function renderCalendar() {
  const days = weekDays();
  const head = document.createElement("div");
  head.className = "calendar-row calendar-head";
  head.append(document.createElement("span"));
  days.forEach((date) => {
    const cell = document.createElement("span");
    cell.textContent = new Intl.DateTimeFormat("ja-JP", { weekday: "short", day: "numeric" }).format(date);
    head.append(cell);
  });

  const rows = state.habits.map((habit) => {
    const row = document.createElement("div");
    row.className = "calendar-row";
    const label = document.createElement("strong");
    label.textContent = habit.name;
    row.append(label);
    days.forEach((date) => {
      const key = todayKey(date);
      const status = statusFor(habit, key);
      const cell = document.createElement("span");
      cell.className = `day-dot ${status}`;
      cell.title = `${habit.name} ${key} ${status}`;
      cell.textContent = status === "done" ? "✓" : status === "skip" ? "−" : "";
      row.append(cell);
    });
    return row;
  });

  els.weekCalendar.replaceChildren(head, ...rows);
}

function habitCard(habit, index) {
  const status = statusFor(habit);
  const due = reminderIsDue(habit);
  const article = document.createElement("article");
  article.className = `habit-card ${status}${due ? " due" : ""}`;
  article.style.borderLeftColor = habit.color || "#2f80ed";

  const info = document.createElement("div");
  const title = document.createElement("div");
  title.className = "habit-title";
  const name = document.createElement("strong");
  name.textContent = habit.name;
  const category = document.createElement("span");
  category.className = "pill";
  category.textContent = habit.category;
  title.append(name, category);

  const meta = document.createElement("div");
  meta.className = "habit-meta";
  const reminder = habit.reminderTime ? `リマインド ${habit.reminderTime}` : "リマインドなし";
  const note = habit.notes[todayKey()] ? "メモあり" : "メモなし";
  meta.textContent = `${reminder} / 連続 ${streakCount(habit)}日 / ${note}`;
  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "habit-actions";
  actions.append(
    actionButton("↑", "上へ", () => moveHabit(index, -1), index === 0),
    actionButton("↓", "下へ", () => moveHabit(index, 1), index === state.habits.length - 1),
    actionButton(status === "done" ? "達成済み" : "達成", "達成", () => setStatus(habit.id, status === "done" ? "pending" : "done"), false, `check-button${status === "done" ? " done" : ""}`),
    actionButton(status === "skip" ? "スキップ済み" : "スキップ", "スキップ", () => setStatus(habit.id, status === "skip" ? "pending" : "skip"), false, `small-button${status === "skip" ? " skip" : ""}`),
    actionButton("メモ", "メモ", () => openNote(habit.id), false, "small-button"),
    actionButton("編集", "編集", () => startEdit(habit.id), false, "small-button"),
    actionButton("削除", "削除", () => deleteHabit(habit.id), false, "small-button danger")
  );

  article.append(info, actions);
  return article;
}

function actionButton(text, label, handler, disabled = false, className = "small-button") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.ariaLabel = label;
  button.disabled = disabled;
  button.addEventListener("click", handler);
  return button;
}

function renderHabits() {
  els.habitList.replaceChildren(...state.habits.map(habitCard));
  els.emptyState.hidden = state.habits.length > 0;
}

function renderAll() {
  updateSummary();
  renderNotice();
  renderCalendar();
  renderHabits();
}

function resetForm() {
  state.editingId = null;
  els.formTitle.textContent = "習慣を追加";
  els.submitButton.textContent = "追加する";
  els.cancelEditButton.hidden = true;
  els.habitForm.reset();
  els.habitColor.value = "#2f80ed";
}

function upsertHabit(event) {
  event.preventDefault();
  const formData = new FormData(els.habitForm);
  const name = formData.get("name").trim();
  if (!name) return;
  if (state.editingId) {
    const habit = state.habits.find((item) => item.id === state.editingId);
    if (habit) {
      habit.name = name;
      habit.category = formData.get("category");
      habit.color = formData.get("color");
      habit.reminderTime = formData.get("reminder");
    }
  } else {
    state.habits.unshift(createHabit(formData));
  }
  saveHabits();
  resetForm();
  renderAll();
}

function moveHabit(index, direction) {
  const target = index + direction;
  if (target < 0 || target >= state.habits.length) return;
  const [habit] = state.habits.splice(index, 1);
  state.habits.splice(target, 0, habit);
  saveHabits();
  renderAll();
}

function startEdit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  state.editingId = id;
  els.formTitle.textContent = "習慣を編集";
  els.submitButton.textContent = "保存する";
  els.cancelEditButton.hidden = false;
  els.habitName.value = habit.name;
  els.habitCategory.value = habit.category;
  els.habitColor.value = habit.color;
  els.habitReminder.value = habit.reminderTime;
  els.habitName.focus();
}

function deleteHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  if (!window.confirm(`「${habit.name}」を削除しますか？`)) return;
  state.habits = state.habits.filter((item) => item.id !== id);
  saveHabits();
  renderAll();
}

function openNote(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  state.noteHabitId = id;
  els.noteTitle.textContent = `${habit.name} のメモ`;
  els.noteText.value = habit.notes[todayKey()] || "";
  els.noteDialog.showModal();
}

function saveNote() {
  const habit = state.habits.find((item) => item.id === state.noteHabitId);
  if (!habit) return;
  const key = todayKey();
  const value = els.noteText.value.trim();
  if (value) habit.notes[key] = value;
  else delete habit.notes[key];
  saveHabits();
  els.noteDialog.close();
  renderAll();
}

function clearNote() {
  els.noteText.value = "";
  saveNote();
}

async function requestNotifications() {
  if (!("Notification" in window)) {
    renderNotice();
    return;
  }
  await Notification.requestPermission();
  renderNotice();
}

function notificationKey(habit) {
  return `${todayKey()}:${habit.id}:${habit.reminderTime}`;
}

function checkReminders() {
  if (!("Notification" in window) || Notification.permission !== "granted") {
    renderAll();
    return;
  }
  state.habits.forEach((habit) => {
    const key = notificationKey(habit);
    if (reminderIsDue(habit) && !state.notified[key]) {
      new Notification("Habit Tap", {
        body: `「${habit.name}」の時間です。今日の分をチェックしましょう。`,
        tag: key
      });
      state.notified[key] = true;
    }
  });
  saveNotified();
  renderAll();
}

function seedHabits() {
  if (state.habits.length > 0) return;
  state.habits = [
    createHabit(new Map([["name", "水を飲む"], ["category", "健康"], ["color", "#2f80ed"], ["reminder", "09:00"]])),
    createHabit(new Map([["name", "10分だけ学習"], ["category", "学習"], ["color", "#16a34a"], ["reminder", "20:00"]]))
  ];
  saveHabits();
}

function bindEvents() {
  els.habitForm.addEventListener("submit", upsertHabit);
  els.cancelEditButton.addEventListener("click", resetForm);
  els.notifyButton.addEventListener("click", requestNotifications);
  els.saveNoteButton.addEventListener("click", saveNote);
  els.clearNoteButton.addEventListener("click", clearNote);
}

function init() {
  formatToday();
  loadState();
  seedHabits();
  bindEvents();
  renderAll();
  checkReminders();
  setInterval(checkReminders, 60 * 1000);
}

init();
