const STORAGE_KEY = "habit-tap.habits.v1";
const NOTIFIED_KEY = "habit-tap.notified.v1";

const state = {
  habits: [],
  editingId: null,
  notified: {}
};

const els = {
  todayLabel: document.querySelector("#todayLabel"),
  notifyButton: document.querySelector("#notifyButton"),
  doneCount: document.querySelector("#doneCount"),
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
  habitList: document.querySelector("#habitList"),
  habitTotal: document.querySelector("#habitTotal"),
  emptyState: document.querySelector("#emptyState")
};

function todayKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatToday() {
  const label = new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "full"
  }).format(new Date());
  els.todayLabel.textContent = label;
}

function loadState() {
  state.habits = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  state.notified = JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}");
}

function saveHabits() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.habits));
}

function saveNotified() {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify(state.notified));
}

function createHabit(formData) {
  return {
    id: crypto.randomUUID(),
    name: formData.get("name").trim(),
    category: formData.get("category"),
    color: formData.get("color"),
    reminderTime: formData.get("reminder"),
    createdAt: new Date().toISOString(),
    completions: {}
  };
}

function isDoneToday(habit) {
  return Boolean(habit.completions[todayKey()]);
}

function reminderIsDue(habit) {
  if (!habit.reminderTime || isDoneToday(habit)) return false;
  const now = new Date();
  const current = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  return current >= habit.reminderTime;
}

function streakCount(habit) {
  let count = 0;
  const cursor = new Date();

  while (habit.completions[todayKey(cursor)]) {
    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return count;
}

function updateSummary() {
  const total = state.habits.length;
  const done = state.habits.filter(isDoneToday).length;
  const pending = total - done;
  const rate = total === 0 ? 0 : Math.round((done / total) * 100);

  els.doneCount.textContent = String(done);
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

function habitCard(habit) {
  const done = isDoneToday(habit);
  const due = reminderIsDue(habit);
  const article = document.createElement("article");
  article.className = `habit-card${done ? " done" : ""}${due ? " due" : ""}`;
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
  meta.textContent = `${reminder} / 連続 ${streakCount(habit)}日`;
  info.append(title, meta);

  const actions = document.createElement("div");
  actions.className = "habit-actions";

  const check = document.createElement("button");
  check.type = "button";
  check.className = `check-button${done ? " done" : ""}`;
  check.textContent = done ? "達成済み" : "達成";
  check.addEventListener("click", () => toggleHabit(habit.id));

  const edit = document.createElement("button");
  edit.type = "button";
  edit.className = "small-button";
  edit.textContent = "編集";
  edit.addEventListener("click", () => startEdit(habit.id));

  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "small-button danger";
  remove.textContent = "削除";
  remove.addEventListener("click", () => deleteHabit(habit.id));

  actions.append(check, edit, remove);
  article.append(info, actions);
  return article;
}

function renderHabits() {
  els.habitList.replaceChildren(...state.habits.map(habitCard));
  els.emptyState.hidden = state.habits.length > 0;
  updateSummary();
  renderNotice();
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
  renderHabits();
}

function toggleHabit(id) {
  const habit = state.habits.find((item) => item.id === id);
  if (!habit) return;
  const key = todayKey();
  habit.completions[key] = !habit.completions[key];
  if (!habit.completions[key]) delete habit.completions[key];
  saveHabits();
  renderHabits();
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
  const ok = window.confirm(`「${habit.name}」を削除しますか？`);
  if (!ok) return;
  state.habits = state.habits.filter((item) => item.id !== id);
  saveHabits();
  renderHabits();
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
    renderHabits();
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
  renderHabits();
}

function seedHabits() {
  if (state.habits.length > 0) return;
  state.habits = [
    {
      id: crypto.randomUUID(),
      name: "水を飲む",
      category: "健康",
      color: "#2f80ed",
      reminderTime: "09:00",
      createdAt: new Date().toISOString(),
      completions: {}
    },
    {
      id: crypto.randomUUID(),
      name: "10分だけ学習",
      category: "学習",
      color: "#16a34a",
      reminderTime: "20:00",
      createdAt: new Date().toISOString(),
      completions: {}
    }
  ];
  saveHabits();
}

function bindEvents() {
  els.habitForm.addEventListener("submit", upsertHabit);
  els.cancelEditButton.addEventListener("click", resetForm);
  els.notifyButton.addEventListener("click", requestNotifications);
}

function init() {
  formatToday();
  loadState();
  seedHabits();
  bindEvents();
  renderHabits();
  checkReminders();
  setInterval(checkReminders, 60 * 1000);
}

init();
