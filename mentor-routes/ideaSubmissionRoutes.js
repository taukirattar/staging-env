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
const authMiddleware = require("../middleware/authMiddleware");

//Approve/Deny Idea Submission
router.patch("/api/idea/approve-deny-idea-submission", async (req, res) => {
  try {
    const { idea_id, mentor_id, status, feedback } = req.body;
    const formattedDate = dateConversion();
    const data = {
      idea_status: status,
      idea_status_date: formattedDate,
      feedback: feedback,
      mentor_id: mentor_id,
    };
    const formattedParams = convertObjectToProcedureParams(data);
    const storedProcedure = "CALL UpdateIdeaSubmission(?, ?)";
    await pool.execute(storedProcedure, [
      formattedParams,
      `idea_id = ${idea_id}`,
    ]);

    res
      .status(201)
      .json({ message: "Review with Feedback Submitted Successfully." });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

module.exports = router;
