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

//MentorLogin
router.post("/api/mentor/login", async (req, res) => {
  const { create_id, password, ip_address } = req.body;
  console.log(create_id, " ", password, " ", ip_address);
  try {
    const [rows] = await pool.execute("CALL GetOrganizerMentorByCreateID(?)", [
      create_id,
    ]);
    const user = rows[0][0];

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    if (user.status === "inactive") {
      return res.status(401).json({ error: "Your account has been Deactivated, Please contact to admin!" });
    }

    if (user.type != "Mentor") {
      return res.status(401).json({ error: "Invalid credentials." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (passwordMatch) {
      const token = generateToken(user.id, "mentor");
      const formattedDate = dateConversion();
      const dynamicFieldsValues = `last_login = "${formattedDate}", last_ip_address = "${ip_address}"`;
      const id = `id  = '${user.id}'`;
      await pool.execute("CALL UpdateOrganizerMentorRegistration(?, ?)", [
        dynamicFieldsValues,
        id,
      ]);

      let FirtTimeResetPwd = false;
      let message = "Login successful.";
      if (parseInt(user.change_first_pwd) === 0) {
        FirtTimeResetPwd = true;
        message = "You have to Change Password then You can Login!";
      }

      res.status(200).json({ message: message, token, FirtTimeResetPwd });
    } else {
      res.status(401).json({ error: "Invalid credentials." });
    }
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//MentorChangePassword
router.patch("/api/mentor/change-password", async (req, res) => {
  const { create_id, password } = req.body;
  try {
    const [rows] = await pool.execute("CALL GetOrganizerMentorByCreateID(?)", [
      create_id,
    ]);
    const user = rows[0][0];

    if (!user) {
      return res
        .status(401)
        .json({ error: "Cannot Change Password. Try Again!" });
    }

    if (user.type != "Mentor") {
      return res
        .status(401)
        .json({ error: "Cannot Change Password. Try Again!" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (passwordMatch) {
      return res
        .status(401)
        .json({ error: "Old password cannot be new password! Try Again!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const dynamicFieldsValues = `change_first_pwd = "1", password = "${hashedPassword}"`;
    const id = `id  = '${user.id}'`;
    await pool.execute("CALL UpdateOrganizerMentorRegistration(?, ?)", [
      dynamicFieldsValues,
      id,
    ]);

    res.status(200).json({
      message: "Password Changed Successfully.",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//Get Mentor By Id
router.get("/api/mentor/mentor-details/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch details
    const [mentor] = await pool.execute("CALL GetOrganizerMentorByID(?)", [id]);
    const mentorRow = mentor[0][0];

    if (!mentorRow) {
      return res.status(400).json({ message: "No Data" });
    }

    return res.status(200).json(mentorRow);

  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
}
);

module.exports = router;
