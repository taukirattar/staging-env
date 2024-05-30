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
  generateOTP,
} = require("../utils");
const moment = require("moment");
const { default: axios } = require("axios");
const authMiddleware = require("../middleware/authMiddleware");

//DeveloperRegistration
router.post("/api/developer/register", async (req, res) => {
  try {
    let {
      first_name,
      last_name,
      create_id,
      email_address,
      password,
      phone_number,
      ip_address,
      terms_condition_agree,
    } = req.body;
    if (!isEmail(email_address)) {
      return res.status(400).json({ error: "Invalid email address." });
    }

    const [emailRes] = await pool.execute("CALL GetDeveloperByEmailID(?)", [
      email_address,
    ]);
    if (
      emailRes[0][0]?.dev_email_address === email_address &&
      emailRes[0][0]?.dev_verification_status === "no"
    ) {
      return res.status(401).json({ error: "Email not verified." });
    }

    const [create_idRes] = await pool.execute(
      "CALL GetDeveloperByCreateID(?)",
      [create_id]
    );
    if (create_idRes[0][0]?.dev_create_id === create_id) {
      return res.status(400).json({ error: "ID already exists!" });
    }

    const formattedDate = dateConversion();
    const hashedPassword = await bcrypt.hash(password, 10);

    const verification_otp = generateOTP();

    const InputFields = {
      dev_first_name: first_name,
      dev_last_name: last_name,
      dev_create_id: create_id,
      dev_email_address: email_address,
      dev_password: hashedPassword,
      dev_verification_code: verification_otp,
      dev_phone_number: phone_number,
      dev_verification_status: "no",
      dev_ip_address: ip_address,
      dev_created_date: formattedDate,
      dev_terms_condition_agree: terms_condition_agree,
    };

    const paramNamesString = Object.keys(InputFields).join(", ");
    const paramValuesString = Object.values(InputFields)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    await pool.execute(
      "CALL InsertDeveloperRegistration(?, ?, @inserted_id_result)",
      [paramNamesString, paramValuesString]
    );

    const mailOptions = {
      from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
      to: email_address,
      subject: "Account Verification | BOB Hackathon",
      html: `<p>Verification OTP: <b>${verification_otp}</b></p>`, // HTML body
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log("Message sent: %s", info.messageId);
    });

    res.status(200).json({
      message: "Registration successful. OTP Email Sent.",
    });
  } catch (error) {
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//DeveloperVerification
router.patch("/api/developer/verify", async (req, res) => {
  try {
    let { create_id, otp } = req.body;
    const [rows] = await pool.execute("CALL VerifyDeveloper(?,?)", [
      create_id,
      otp,
    ]);
    if (rows && rows[0] && rows[0][0]) {
      const dynamicFieldsValues = `dev_verification_status = 'yes'`;
      const id = `dev_create_id  = '${create_id}'`;
      await pool.execute("CALL UpdateDeveloperRegistration(?, ?)", [
        dynamicFieldsValues,
        id,
      ]);
      return res.status(200).json({ message: "Verified successfully." });
    } else {
      return res.status(400).json({ error: "Invalid otp or User not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

//DeveloperLogin
router.post("/api/developer/login", async (req, res) => {
  const { create_id, password, ip_address } = req.body;
  try {
    const [rows] = await pool.execute("CALL GetDeveloperByCreateID(?)", [
      create_id,
    ]);
    const user = rows[0][0];

    if (!user) {
      return res.status(400).json({ error: "Invalid credentials." });
    }
    if (user.dev_verification_status === "no") {
      return res.status(401).json({ error: "Email not verified." });
    }
    const passwordMatch = await bcrypt.compare(password, user.dev_password);
    if (passwordMatch) {
      const token = generateToken(user.dev_id, "developer");
      const formattedDate = dateConversion();
      const dynamicFieldsValues = `dev_last_login = "${formattedDate}", dev_last_ip_address = "${ip_address}"`;
      const id = `dev_id  = '${user.dev_id}'`;
      await pool.execute("CALL UpdateDeveloperRegistration(?, ?)", [
        dynamicFieldsValues,
        id,
      ]);

      res.status(200).json({ message: "Login successful.", token });
    } else {
      res.status(400).json({ error: "Invalid credentials." });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

//DeveloperForgotPassword
router.post("/api/developer/forgot-password", async (req, res) => {
  const { username_email } = req.body;
  try {
    const [devRes] = await pool.execute(
      "CALL GetDeveloperRegistrationByUsernameEmail(?)",
      [username_email]
    );
    if (devRes[0][0]?.dev_verification_status === "no") {
      return res
        .status(401)
        .json({ error: "Please verify your account first." });
    }

    if (devRes[0].length > 0) {
      const email_address = devRes[0][0]?.dev_email_address;
      const dev_forgot_pwd_expiry_date = moment()
        .add(24, "hours")
        .format("YYYY-MM-DD HH:mm:ss");
      const forgot_pwd_otp = generateOTP();

      const dynamicFieldsValues = `dev_forgot_pwd_code = '${forgot_pwd_otp}',
                                    dev_forgot_pwd_expiry_date = '${dev_forgot_pwd_expiry_date}'`;
      const id = `dev_email_address  = '${email_address}'`;
      await pool.execute("CALL UpdateDeveloperRegistration(?, ?)", [
        dynamicFieldsValues,
        id,
      ]);

      const mailOptions = {
        from: `"BOB Hackathon" <${process.env.SMTP_FROM}>`,
        to: email_address,
        subject: "Forgot Password OTP | BOB Hackathon",
        html: `<p>Forgot Password OTP: <b>${forgot_pwd_otp}</b></p>`, // HTML body
      };

      transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
          return console.log(error);
        }
        console.log("Message sent: %s", info.messageId);
      });

      res.status(200).json({
        message: "OTP Email Sent.",
      });
    } else {
      // User not found
      res.status(404).json({ error: "Email address not registered." });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

//DeveloperForgotPWDVerification
router.patch("/api/developer/forgot-pwd-otp-verify", async (req, res) => {
  try {
    let { username_email, otp } = req.body;
    const [rows] = await pool.execute("CALL VerifyForgotPWDDeveloper(?,?)", [
      username_email,
      otp,
    ]);
    if (rows && rows[0] && rows[0][0]) {
      return res.status(200).json({ message: "Verified successfully." });
    } else {
      return res.status(400).json({ error: "Invalid otp or User not found." });
    }
  } catch (error) {
    res.status(500).json({ error: "Internal server error." });
  }
});

//DeveloperChangePassword (forget password)
router.patch("/api/developer/change-password", async (req, res) => {
  const { username_email, password } = req.body;
  try {
    const [devRes] = await pool.execute(
      "CALL GetDeveloperRegistrationByUsernameEmail(?)",
      [username_email]
    );

    if (devRes[0].length > 0) {
      const CurrentDate = dateConversion();
      const create_id = devRes[0][0]?.dev_create_id;
      const dev_forgot_pwd_expiry_date = moment(
        devRes[0][0]?.dev_forgot_pwd_expiry_date
      ).format("YYYY-MM-DD HH:mm:ss");

      if (dev_forgot_pwd_expiry_date > CurrentDate) {
        const hashedPassword = await bcrypt.hash(password, 10);
        const dynamicFieldsValues = `dev_password = '${hashedPassword}'`;
        const id = `dev_create_id  = '${create_id}'`;
        await pool.execute("CALL UpdateDeveloperRegistration(?, ?)", [
          dynamicFieldsValues,
          id,
        ]);
        res.status(201).json({ message: "Password Reset Successfully." });
      } else {
        return res.status(402).json({ error: "OTP Expired. Try Again." });
      }
    } else {
      return res.status(400).json({ error: "Invalid otp or User not found." });
    }
  } catch (err) {
    console.log(err);
    res.status(500).json({ error: "Internal server error." });
  }
});

//DeveloperUpdateProfile
router.patch(
  "/api/developer/update-profile",
  authMiddleware,
  async (req, res) => {
    try {
      const { dev_id, ...otherFields } = req.body;

      const updateData = {
        ...otherFields,
      };

      const procedureParams = convertObjectToProcedureParams(updateData);

      const storedProcedure = "CALL UpdateDeveloperRegistration(?, ?)";
      await pool.execute(storedProcedure, [
        procedureParams,
        `dev_id = ${dev_id}`,
      ]);

      res.status(200).json({
        message: "Profile Updated Successfully.",
      });
    } catch (err) {
      console.log(err);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

//DeveloperViewProfile
router.get(
  "/api/developer/view-profile/:dev_id",
  authMiddleware,
  async (req, res) => {
    const { dev_id } = req.params;
    try {
      const [rows] = await pool.execute("CALL getDeveloperById(?)", [dev_id]);
      const profile = rows[0][0];

      if (profile.dev_describe_you_best) {
        profile.dev_describe_you_best =
          profile.dev_describe_you_best.split(",");
      }
      if (profile.dev_tech_skills) {
        profile.dev_tech_skills = profile.dev_tech_skills.split(",");
      }

      res.status(200).json(profile);
    } catch (error) {
      console.log(error);
      res.status(500).json({ error: "Internal server error." });
    }
  }
);

//DisplayActiveEvents
router.get("/api/developer/display-active-events", async (req, res) => {
  try {
    const [rows] = await pool.execute("CALL ViewActiveEvents()");
    const currentDate = moment().startOf("day");

    const events = rows[0].map((event) => {
      const eventStartDate = moment(event.event_start_date);
      const eventEndDate = moment(event.event_end_date);
      return {
        ...event,
        event_image: event.event_image
          ? `https://${process.env.S3_BUCKET_NAME}.s3.amazonaws.com/events_images/${event.event_image}`
          : "",
        event_start_date: eventStartDate,
        event_end_date: eventEndDate,
      };
    });

    const pastEvents = [];
    const upcomingEvents = [];

    events.forEach((event) => {
      const eventData = {
        image: event.event_image,
        name: event.event_title,
        description: event.event_description,
      };

      if (event.event_end_date.isBefore(currentDate)) {
        pastEvents.push(eventData);
      } else {
        upcomingEvents.push(eventData);
      }
    });

    res.status(200).json({ pastEvents, upcomingEvents });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Internal server error." });
  }
});

//User Details
router.post("/api/developer/user-details-through-github", async (req, res) => {
  const { codeMatch, clientId, clientSecret, redirectUrl } = req.body;
  try {
    if (!codeMatch) {
      res.status(400).json({ message: "No code provided." });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code: codeMatch,
    });

    const accessTokenResponse = await axios.post(
      `https://github.com/login/oauth/access_token`,
      `grant_type=authorization_code&code=${codeMatch}&client_id=${clientId}&client_secret=${clientSecret}&redirect_uri=${redirectUrl}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      }
    );

    const userInfoResponse = await axios.get(`https://api.github.com/user`, {
      headers: {
        Authorization: `Bearer ${accessTokenResponse.data.access_token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    const emailInfoResponse = await axios.get(
      `https://api.github.com/user/emails`,
      {
        headers: {
          Authorization: `Bearer ${accessTokenResponse.data.access_token}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    res.status(200).json({
      userData: userInfoResponse.data,
      emailData: emailInfoResponse.data[0],
    });
  } catch (error) {
    console.log(error);
    if (error.response && error.response.status === 401) {
      res
        .status(401)
        .json({ message: "Unauthorized. Invalid code or credentials." });
    }
    res.status(400).json({ message: "Error authenticating" });
  }
});

//Developer Login through Github
router.patch("/api/developer/login-through-github", async (req, res) => {
  try {
    let {
      dev_ip_address,
      dev_email_address,
      dev_github_login,
      dev_create_id,
      ...otherFields
    } = req.body;
    const formattedDate = dateConversion();
    const [devRes] = await pool.execute(
      "CALL GetDeveloperByEmailOrGithub(?,?)",
      [dev_email_address, dev_github_login]
    );

    let devId = 0;
    if (devRes[0][0]) {
      devId = devRes[0][0].dev_id;
      const additionalFields = {
        ...otherFields,
        dev_github_login: dev_github_login,
        dev_email_address: dev_email_address,
        dev_ip_address: dev_ip_address,
      };
      const formattedParams = convertObjectToProcedureParams(additionalFields);
      const storedProcedure = "CALL UpdateDeveloperRegistration(?, ?)";
      await pool.execute(storedProcedure, [
        formattedParams,
        `dev_id = ${devId}`,
      ]);
    } else {
      const additionalFields = {
        dev_github_login: dev_github_login,
        dev_create_id: dev_create_id,
        dev_email_address: dev_email_address,
        dev_ip_address: dev_ip_address,
        dev_created_date: formattedDate,
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

      const callProcedureSQL = `CALL InsertDeveloperRegistration(?, ?, @inserted_id_result)`;
      await pool.execute(callProcedureSQL, [
        paramNamesString,
        paramValuesString,
      ]);

      const [insertedIdResult] = await pool.execute(
        "SELECT @inserted_id_result AS inserted_id"
      );

      devId = insertedIdResult[0]?.inserted_id;
    }
    const token = generateToken(devId, "developer");
    const dynamicFieldsValues = `dev_last_login = "${formattedDate}", dev_last_ip_address = "${dev_ip_address}"`;
    const id = `dev_id  = '${devId}'`;
    await pool.execute("CALL UpdateDeveloperRegistration(?, ?)", [
      dynamicFieldsValues,
      id,
    ]);

    res.status(200).json({ message: "Login successful.", token });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
