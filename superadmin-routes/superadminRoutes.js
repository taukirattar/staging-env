require("dotenv").config();
const express = require("express");
const router = express.Router();
const pool = require("../config/database");
const { isEmail } = require("validator");
const bcrypt = require("bcrypt");
const mysql = require("mysql");
const { generateToken } = require("../utils/auth");
const {
  dateConversion,
  transporter,
  convertObjectToProcedureParams,
} = require("../utils");
const authMiddleware = require("../middleware/authMiddleware");

//SuperadminLogin
router.post("/api/superadmin/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    const [rows] = await pool.execute("CALL CheckSuperadmin(?)", [username]);
    const superadmin = rows[0][0];

    if (!superadmin) {
      return res.status(401).json({ error: "Invalid credentials." });
    }
    const passwordMatch = await bcrypt.compare(
      password,
      superadmin.sa_password
    );
    if (passwordMatch) {
      const token = generateToken(superadmin.sa_id, "superadmin");

      res.status(200).json({ message: "Login successful.", token });
    } else {
      res.status(401).json({ error: "Invalid credentials." });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

//CreateOrganizerMentor
router.post(
  "/api/superadmin/insert-organizer-mentor",
  authMiddleware,
  async (req, res) => {
    try {
      const { create_id, type, email_address, password } = req.body;
      const formattedDate = dateConversion();

      if (!isEmail(email_address)) {
        return res.status(400).json({ error: "Invalid email address." });
      }

      const [emailResult] = await pool.execute(
        "CALL GetOrganizerMentorByEmailID(?)",
        [email_address]
      );
      if (emailResult[0][0]?.email_address === email_address) {
        return res.status(400).json({ error: "Email already exists!" });
      }

      const [create_idResult] = await pool.execute(
        "CALL GetOrganizerMentorByCreateID(?)",
        [create_id]
      );
      if (create_idResult[0][0]?.create_id === create_id) {
        return res.status(400).json({ error: "ID already exists!" });
      }

      const InputFields = {
        ...req.body,
        change_first_pwd: "0",
        status: "active",
        created_date: formattedDate,
      };
      if (InputFields.password) {
        const hashedPassword = await bcrypt.hash(InputFields.password, 10);
        InputFields.password = hashedPassword;
      }

      const paramNamesString = Object.keys(InputFields).join(", ");
      const paramValuesString = Object.values(InputFields)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      await pool.execute(
        "CALL InsertOrganizerMentorRegistration(?, ?, @inserted_id_result)",
        [paramNamesString, paramValuesString]
      );

      let path_url = `${process.env.FRONTEND_URL}mentor/login`;
      if (type === "Organizer") {
        path_url = `${process.env.FRONTEND_URL}organizer/login`;
      }

      const mailOptions = {
        from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
        to: email_address,
        subject: `${type} Credentials | BOB Hackathon`,
        html: `<p>Hello! <br> Credentials: <br> Create ID: <b>${create_id}</b> <br> Password: <b>${password}</b> <br> URL: <b>${path_url}</b></p>`, // HTML body
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log("Message sent: %s", info.messageId);
      });

      res.status(200).json({
        message: "Added successfully.",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

//UpdateOrganizerMentor
router.patch(
  "/api/superadmin/update-organizer-mentor",
  authMiddleware,
  async (req, res) => {
    try {
      const { id, ...otherFields } = req.body;

      const procedureParams = convertObjectToProcedureParams(otherFields);

      const storedProcedure = "CALL UpdateOrganizerMentorRegistration(?, ?)";
      await pool.execute(storedProcedure, [procedureParams, `id = ${id}`]);

      res.status(200).json({
        message: "Updated successfully.",
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

//ViewOrganizerMentor
router.get(
  "/api/superadmin/view-organizer-mentor",
  authMiddleware,
  async (req, res) => {
    try {
      const [result] = await pool.execute("CALL ViewAllOrganizerMentor()");

      const Lists = result[0];

      res.status(200).json({ Lists });
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

module.exports = router;
