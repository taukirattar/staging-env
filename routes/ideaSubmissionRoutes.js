require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const mysql = require("mysql");
const uniqid = require("uniqid");
const {
  dateConversion,
  transporter,
  convertObjectToProcedureParams,
} = require("../utils");
const { default: axios } = require("axios");
const authMiddleware = require("../middleware/authMiddleware");

//Get Teams Idea Submission
router.get(
  "/api/idea/view-team-idea-submission/:teamId",
  authMiddleware,
  async (req, res) => {
    try {
      const { teamId } = req.params;
      const [idea] = await pool.execute("CALL getTeamIdeaSubmission(?)", [
        teamId,
      ]);
      const ideaRow = idea[0][0];

      res.status(201).json({ ideaDetails: ideaRow });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//Insert Idea Submission
router.post(
  "/api/idea/insert-idea-submission",
  authMiddleware,
  async (req, res) => {
    try {
      const { ppt, s3ppt, ...otherFields } = req.body;
      const formattedDate = dateConversion();

      let ppt_name = "";
      const time = Math.floor(Date.now() / 1000);
      const fileName = `${time}_${ppt}`;

      if (s3ppt) {
        //   const params = {
        //     Bucket: process.env.S3_BUCKET_NAME,
        //     Key: `idea_submission_ppt/${fileName}`,
        //     Body: Buffer.from(s3ppt, "base64"),
        //     ContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        //     ACL: "public-read",
        //   };
        //   await UPLOAD_HELPER.UploadS3File(params);
        ppt_name = fileName;
      }

      const additionalFields = {
        ppt_file_name: ppt_name,
        idea_status: "pending",
        idea_status_date: formattedDate,
        created_date: formattedDate,
      };

      const requestBodyWithAdditionalFields = {
        ...otherFields,
        ...additionalFields,
      };
      const paramNamesString = Object.keys(
        requestBodyWithAdditionalFields
      ).join(", ");
      const paramValuesString = Object.values(requestBodyWithAdditionalFields)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      const callProcedureSQL = `CALL InsertIdeaSubmission(?, ?, @inserted_id_result)`;
      await pool.execute(callProcedureSQL, [
        paramNamesString,
        paramValuesString,
      ]);

      res.status(201).json({ message: "Idea Submitted Successfully." });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//Update Idea Submission
router.patch(
  "/api/idea/update-idea-submission",
  authMiddleware,
  async (req, res) => {
    try {
      const { idea_id, ppt, s3ppt, ...otherFields } = req.body;

      const formattedDate = dateConversion();
      const [rows] = await pool.execute("CALL GetIdeaSubmissionByID(?)", [
        idea_id,
      ]);

      let ppt_name = rows[0][0]?.ppt_file_name;

      if (ppt && s3ppt) {
        const time = Math.floor(Date.now() / 1000);
        const fileName = `${time}_${ppt}`;

        if (s3ppt) {
          //   const params = {
          //     Bucket: process.env.S3_BUCKET_NAME,
          //     Key: `idea_submission_ppt/${fileName}`,
          //     Body: Buffer.from(s3ppt, "base64"),
          //     ContentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          //     ACL: "public-read",
          //   };
          //   await UPLOAD_HELPER.UploadS3File(params);
          ppt_name = fileName;
        }
      }

      const InputFields = {
        ...otherFields,
        ppt_file_name: ppt_name,
        idea_status: "pending",
        idea_status_date: formattedDate,
        updated_date: formattedDate,
      };

      const formattedParams = convertObjectToProcedureParams(InputFields);
      const storedProcedure = "CALL UpdateIdeaSubmission(?, ?)";
      await pool.execute(storedProcedure, [
        formattedParams,
        `idea_id = ${idea_id}`,
      ]);

      res.status(201).json({ message: "Idea Updated Successfully." });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//Send Reminder for idea Submission
router.post(
  "/api/idea/reminder-idea-submission",
  authMiddleware,
  async (req, res) => {
    try {
      const { teamId } = req.body;
      const [team] = await pool.execute("CALL checkTeamByTeamId(?)", [teamId]);
      const teamRow = team[0][0];

      const [membersEmails] = await pool.execute(
        "CALL getTeamEmailAddresses(?)",
        [teamId]
      );
      const membersEmailResult = membersEmails[0];
      const emailAddresses = membersEmailResult
        .map((item) => item.dev_email_address)
        .join(",");

      const mailOptions = {
        from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
        to: emailAddresses,
        subject: "Reminder for Idea Submission | BOB Hackathon",
        html: `<p><b>Team Submit your Idea before the hackathon ends`, // HTML body
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log("Message sent: %s", info.messageId);
      });

      res.status(201).json({ message: "Reminder Email Send Successfully" });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//Send Bulk Email for idea Submission Based on Status
router.post("/api/idea/send-bulk-email", authMiddleware, async (req, res) => {
  try {
    const { statusButton } = req.body;
    const [membersEmails] = await pool.execute(
      "CALL getBulkEmailAddresses(?)",
      [statusButton]
    );
    const membersEmailResult = membersEmails[0];
    let subject = "";
    let htmlContent = "";
    if (statusButton === "approved") {
      subject = "Idea Submission Approved | BOB Hackathon";
      htmlContent = "Approved Mail";
    } else if (statusButton === "deny") {
      subject = "Idea Submission Deny | BOB Hackathon";
      htmlContent = "Deny Mail";
    } else {
      subject = "Idea Submission In Review | BOB Hackathon";
      htmlContent = "Pending Mail";
    }

    const sender = { name: "BOB Hackathon", email: `${process.env.SMTP_FROM}` };
    const emailData = {
      sender,
      to: membersEmailResult.map((recipient) => ({
        email: recipient.dev_email_address,
        name: `${recipient.dev_first_name} ${recipient.dev_last_name}`,
      })),
      subject,
      htmlContent,
    };

    const response = await axios.post(
      "https://api.sendinblue.com/v3/smtp/email",
      emailData,
      {
        headers: {
          "api-key": process.env.BREVO_BULK_API_kEY,
          "Content-Type": "application/json",
        },
      }
    );
    console.log("Bulk email sent successfully:", response.data);

    res.status(201).json({ message: "Email Send Successfully" });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
