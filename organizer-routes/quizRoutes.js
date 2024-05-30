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

//Create Quiz
router.post("/api/quiz/create-quiz", authMiddleware, async (req, res) => {
  try {
    const { ...otherFields } = req.body;
    const formattedDate = dateConversion();

    const additionalFields = {
      quiz_created_date: formattedDate,
    };

    const requestBodyWithAdditionalFields = {
      ...otherFields,
      ...additionalFields,
    };
    const paramNamesString = Object.keys(requestBodyWithAdditionalFields).join(
      ", "
    );
    const paramValuesString = Object.values(requestBodyWithAdditionalFields)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    const callProcedureSQL = `CALL InsertQuizMcqs(?, ?, @inserted_id_result)`;
    await pool.execute(callProcedureSQL, [paramNamesString, paramValuesString]);

    res.status(201).json({ message: "Quiz Created Successfully." });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Update Quiz
router.patch("/api/quiz/update-quiz", authMiddleware, async (req, res) => {
  try {
    const { organizer_id, quiz_id, ...otherFields } = req.body;
    const formattedDate = dateConversion();
    const formattedParams = convertObjectToProcedureParams(otherFields);
    const storedProcedure = "CALL UpdateQuizMcqs(?, ?)";
    await pool.execute(storedProcedure, [
      formattedParams,
      `quiz_id = ${quiz_id}`,
    ]);

    const history = {
      organizer_id: organizer_id,
      quiz_id: quiz_id,
      quiz_history_description: "Quiz Updated",
      history_date: formattedDate,
    };

    const paramNamesString1 = Object.keys(history).join(", ");
    const paramValuesString1 = Object.values(history)
      .map((value) =>
        typeof value === "string"
          ? `"${mysql.escape(value).slice(1, -1)}"`
          : `'${value}'`
      )
      .join(", ");

    const callProcedureSQL1 = `CALL InsertQuizHistory(?, ?, @inserted_id_result)`;
    await pool.execute(callProcedureSQL1, [
      paramNamesString1,
      paramValuesString1,
    ]);

    res.status(201).json({ message: "Quiz Updated Successfully." });
  } catch (error) {
    console.log(error);
    res
      .status(500)
      .json({ error: "Internal Server Error", details: error.message });
  }
});

//Delete Quiz
router.delete(
  "/api/quiz/delete-quiz/:quiz_id/:organizer_id",
  authMiddleware,
  async (req, res) => {
    try {
      const { quiz_id, organizer_id } = req.params;
      const formattedDate = dateConversion();
      const del = `quiz_id = '${quiz_id}'`;
      await pool.execute("CALL DeleteQuizMcqs(?)", [del]);

      const history = {
        organizer_id: organizer_id,
        quiz_id: quiz_id,
        quiz_history_description: "Quiz Deleted",
        history_date: formattedDate,
      };

      const paramNamesString1 = Object.keys(history).join(", ");
      const paramValuesString1 = Object.values(history)
        .map((value) =>
          typeof value === "string"
            ? `"${mysql.escape(value).slice(1, -1)}"`
            : `'${value}'`
        )
        .join(", ");

      const callProcedureSQL1 = `CALL InsertQuizHistory(?, ?, @inserted_id_result)`;
      await pool.execute(callProcedureSQL1, [
        paramNamesString1,
        paramValuesString1,
      ]);

      res.status(201).json({ message: "Quiz Deleted Successfully." });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

//Get All Quiz Created By Organizer
router.get(
  "/api/quiz/organizer-all-quiz/:organizerId",
  authMiddleware,
  async (req, res) => {
    try {
      const { organizerId } = req.params;
      const [quiz] = await pool.execute("CALL getOrganizerQuiz(?)", [
        organizerId,
      ]);
      const quizResult = quiz[0];
      res.status(201).json({ quizResult });
    } catch (error) {
      console.log(error);
      res
        .status(500)
        .json({ error: "Internal Server Error", details: error.message });
    }
  }
);

module.exports = router;
