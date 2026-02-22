document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("help.html");

  const msg = document.getElementById("msg");

  document.getElementById("helpForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const text = document.getElementById("helpText").value.trim();
    if (!text) {
      msg.textContent = "Please enter your request.";
      return;
    }

    addHelpRequest(user.id, text);

    const subject = encodeURIComponent(`Band Scheduler Help Request from ${user.username}`);
    const body = encodeURIComponent(
      `Username: ${user.username}\nEmail: ${user.email}\n\nHelp Request:\n${text}`
    );
    window.location.href = `mailto:ZeldaReySkywalker@gmail.com?subject=${subject}&body=${body}`;
    msg.textContent = "Help request prepared in your mail client and saved locally.";
    e.target.reset();
  });
});
