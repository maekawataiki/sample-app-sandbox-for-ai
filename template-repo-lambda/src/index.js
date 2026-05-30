// AWS Lambda handler invoked directly by the ALB (Lambda target group). The ALB
// passes an event with `path`, `httpMethod`, headers, etc. and expects a
// response shaped like { statusCode, statusDescription, headers, body }.
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function reply(statusCode, body, contentType) {
  // Note: ALB rejects a bare statusDescription like "200" (it must be
  // "<code> <reason>", e.g. "200 OK"). Omitting it lets ALB fill the reason.
  return {
    statusCode,
    isBase64Encoded: false,
    headers: { "Content-Type": contentType },
    body,
  };
}

exports.handler = async (event) => {
  const path = event.path || "/";

  if (path === "/healthz") {
    return reply(200, JSON.stringify({ status: "ok" }), "application/json");
  }

  const serviceName = escapeHtml(process.env.SERVICE_NAME || "prototype");
  return reply(
    200,
    `<h1>Hello from ${serviceName} (Lambda)</h1><p>Edit src/index.js and push to deploy.</p>`,
    "text/html",
  );
};
