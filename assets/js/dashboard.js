document.addEventListener("DOMContentLoaded", () => {
  const user = requireAuth();
  if (!user) return;
  renderNav("dashboard.html");
});
