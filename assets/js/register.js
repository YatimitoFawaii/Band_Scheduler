document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const msg = document.getElementById("msg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    msg.textContent = "";
    const username = document.getElementById("username").value;
    const email = document.getElementById("email").value;
    const password = document.getElementById("password").value;

    const res = await registerUser({ username, email, password });
    if (!res.ok) {
      msg.textContent = res.message;
      return;
    }
    msg.textContent = "Registered. Redirecting to login...";
    setTimeout(() => {
      window.location.href = "index.html";
    }, 800);
  });
});
