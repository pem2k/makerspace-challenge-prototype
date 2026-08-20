window.remy.onReminder((reminder) => {
  document.querySelector("#title").textContent = reminder.title;
  document.querySelector("#message").textContent = reminder.message;
});

document.querySelector("#done").addEventListener("click", () => window.remy.completeReminder());
document.querySelector("#snooze").addEventListener("click", () => window.remy.snoozeReminder());
