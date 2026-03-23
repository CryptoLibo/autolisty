import { NextResponse } from "next/server";
import nodemailer from "nodemailer";

export const runtime = "nodejs";

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const name = String(body?.name || "").trim();
    const email = String(body?.email || "").trim();
    const subject = String(body?.subject || "").trim();
    const message = String(body?.message || "").trim();

    if (!name || !email || !subject || !message) {
      return NextResponse.json(
        { error: "All contact form fields are required." },
        { status: 400 }
      );
    }

    if (!isValidEmail(email)) {
      return NextResponse.json(
        { error: "Please provide a valid email address." },
        { status: 400 }
      );
    }

    const transporter = nodemailer.createTransport({
      host: getRequiredEnv("SMTP_HOST"),
      port: Number(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: getRequiredEnv("SMTP_USER"),
        pass: getRequiredEnv("SMTP_PASS"),
      },
    });

    const contactTo = getRequiredEnv("CONTACT_TO_EMAIL");
    const fromEmail = process.env.CONTACT_FROM_EMAIL || getRequiredEnv("SMTP_USER");
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeSubject = escapeHtml(subject);
    const safeMessage = escapeHtml(message);

    await transporter.sendMail({
      from: fromEmail,
      to: contactTo,
      replyTo: email,
      subject: `Autolisty Contact: ${subject.replace(/[\r\n]+/g, " ").slice(0, 160)}`,
      text: [`Name: ${name}`, `Email: ${email}`, `Subject: ${subject}`, "", message].join("\n"),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;">
          <h2 style="margin-bottom:16px;">New contact form submission</h2>
          <p><strong>Name:</strong> ${safeName}</p>
          <p><strong>Email:</strong> ${safeEmail}</p>
          <p><strong>Subject:</strong> ${safeSubject}</p>
          <div style="margin-top:20px;padding:16px;border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;white-space:pre-wrap;">${safeMessage}</div>
        </div>
      `,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Contact form error:", error);
    return NextResponse.json(
      { error: "Unable to send your message right now." },
      { status: 500 }
    );
  }
}
