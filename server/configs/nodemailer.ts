import nodemailer from "nodemailer";
import { logger } from "./logger.js";

const transporter = nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

interface SendEmailInput {
    to: string;
    subject: string;
    body: string;
}

const sendEmail = async ({ to, subject, body }: SendEmailInput) => {
    const response = await transporter.sendMail({
        from: process.env.SENDER_EMAIL,
        to,
        subject,
        html: body,
    });
    logger.info({ subject, messageId: response.messageId }, "Email sent");
    return response;
};

export default sendEmail;
