require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const axios = require("axios");
const authMiddleware = require("../middleware/authMiddleware");

const sendBulkEmails = async (recipients, subject, emailBody) => {
  const apiKey = process.env.BREVO_BULK_API_kEY; // Your Brevo API key
  const sender = { name: "Arshad Sayyed", email: process.env.SMTP_FROM };
  // const subject = "Hello from Brevo bulk email!";
  // const htmlContent = "<p>This is a test bulk email sent using Brevo.</p>";
  const htmlContent = emailBody;

  const emailData = {
    sender,
    bcc: recipients.map((recipient) => ({
      email: recipient.email,
      name: recipient.name,
    })),
    subject,
    htmlContent,
  };

  try {
    const response = await axios.post(
      "https://api.sendinblue.com/v3/smtp/email",
      emailData,
      {
        headers: {
          "api-key": apiKey,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Bulk email sent successfully:", response.data);
  } catch (error) {
    console.error("Error sending bulk email:", error);
  }
};

router.post(
  "/api/organizer/sendbulkemail",
  authMiddleware,
  async (req, res) => {
    const { category, subject, emailBody } = req.body;
    try {
      const [rows] = await pool.execute("CALL GetRecipientsByCategory(?)", [
        category,
      ]);
      const recipients = rows[0];

      if (!recipients) {
        return res.status(200).json({ error: "No Email List Found." });
      }

      await sendBulkEmails(recipients, subject, emailBody);
      res.status(200).send({ message: "Bulk emails sent successfully" });
    } catch (error) {
      console.log("error");
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

module.exports = router;
