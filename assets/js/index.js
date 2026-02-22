document.addEventListener("DOMContentLoaded", () => {
  if (getCurrentUser()) {
    window.location.href = "dashboard.html";
    return;
  }

  const form = document.getElementById("loginForm");
  const msg = document.getElementById("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    const login = document.getElementById("login").value;
    const password = document.getElementById("password").value;
    const res = await loginUser({ login, password });
    if (!res.ok) {
      msg.textContent = res.message;
      return;
    }
    window.location.href = "dashboard.html";
  });
});
