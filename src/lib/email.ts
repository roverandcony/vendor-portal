type EmailPayload = {
  subject: string;
  text: string;
  html?: string;
};

function getAdminEmails() {
  const raw =
    process.env.ADMIN_NOTIFY_EMAILS ||
    process.env.ADMIN_NOTIFY_EMAIL ||
    "";

  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export async function sendAdminNotification(payload: EmailPayload) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_FROM_EMAIL;
  const to = getAdminEmails();

  if (!apiKey || !from || to.length === 0) {
    console.warn("Admin email notification skipped: missing env config.");
    return { ok: false, skipped: true };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: payload.subject,
      text: payload.text,
      html: payload.html,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Failed to send admin email:", res.status, body);
    return { ok: false };
  }

  return { ok: true };
}
