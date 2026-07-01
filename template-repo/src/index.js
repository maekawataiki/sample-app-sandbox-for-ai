const express = require("express");
const { createCedarAuth } = require("@prototype/cedar-auth");

const app = express();
const PORT = parseInt(process.env.PORT || "8080", 10);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

app.use(createCedarAuth());

app.get("/healthz", (_req, res) => res.json({ status: "ok" }));

app.get("/", (req, res) => {
  const serviceName = escapeHtml(process.env.SERVICE_NAME || "prototype");
  const email = escapeHtml(req.cedarUser?.email || "");
  res.send(`<h1>Hello from ${serviceName}</h1><p>Edit src/index.js and push to deploy.</p><p>${email}</p>`);
});

app.listen(PORT, () => console.log(`Listening on :${PORT}`));
