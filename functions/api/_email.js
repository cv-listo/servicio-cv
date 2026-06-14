export async function sendEmail(env, { to, subject, html, attachments = [] }) {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) {
    return { ok: false, skipped: true, reason: "Email provider not configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [to],
      subject,
      html,
      attachments,
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}
