export async function sendEmail(env, { to, subject, html }) {
  if (env.EMAIL_PROVIDER === "google_script" && env.EMAIL_WEBHOOK_URL) {
    const response = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        secret: env.EMAIL_WEBHOOK_SECRET || "",
        from: env.ACCESS_EMAIL_FROM || "CV Listo",
        to,
        subject,
        html,
      }),
    });

    const data = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, data };
  }

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
    }),
  });

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}
